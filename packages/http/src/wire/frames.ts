/**
 * The frames of the data endpoint (SDD-70 §3.7): what `GET /_fudic/data/<route>` answers with,
 * in `fud-bin` (SDD-67).
 *
 * The first frame carries what `load` resolved and the layout's props; then one frame per
 * `later` field, in the order the fields settle, with its value or its `Problem`. A route
 * without `later` fields answers with the first frame alone. The order of painting is the
 * render's business, so the endpoint holds nothing back.
 *
 * `data` travels by the types its `.fudapi` declares. The layout's props do not: their type is
 * the layout's own, written in TypeScript and never in a `.fudapi`, so they travel as an `any`,
 * which says as much as the JSON they travelled as before.
 *
 * On the wire, a frame is its length (four bytes, big-endian) and then its body: one byte for
 * its kind, one for the index of its field among the `later` ones (a value frame only), and
 * the value.
 */

import { DATA_FRAMES_TYPE } from '@fudic/conventions';
import type { Problem } from '../errors.js';
import { binWire } from './bin.js';
import { PROBLEM } from './problem.js';
import type { Ty } from './ty.js';

/** The content type of the data endpoint's answer. */
export const FRAMES_TYPE = DATA_FRAMES_TYPE;

/** What the frames are written and read with: the `fields` and the `later` of a `load`'s spec. */
export interface DataTypes {
  readonly fields?: Readonly<Record<string, Ty>>;
  readonly later?: readonly string[];
}

/** A type of `load` as JSON (`@fudic/api`'s `DataTy`): a primitive by its name, a named type by `ref`. */
export type ShapeTy =
  | string
  | { readonly list: ShapeTy }
  | { readonly opt: ShapeTy }
  | { readonly map: readonly [ShapeTy, ShapeTy] }
  | { readonly oneOf: readonly string[] }
  | { readonly ref: string };

/** The types of `load` as JSON (`@fudic/api`'s `FramesShape`): what a route chunk carries. */
export interface FramesShape {
  readonly fields: Readonly<Record<string, ShapeTy>>;
  readonly types: Readonly<Record<string, Readonly<Record<string, ShapeTy>>>>;
  readonly later: readonly string[];
}

/**
 * The same types as `Ty`, for a reader that has the JSON and not the module of the `.fudapi`:
 * the Service Worker, which never imports one. A named type is one object, however many times
 * it is named, so a type that names itself is still one.
 */
export function typesOfShape(shape: FramesShape): DataTypes {
  const named = new Map<string, Ty>();
  const of = (t: ShapeTy): Ty => {
    if (typeof t === 'string') return t as Ty;
    if ('list' in t) return { list: of(t.list) };
    if ('opt' in t) return { opt: of(t.opt) };
    if ('map' in t) return { map: [of(t.map[0]), of(t.map[1])] };
    if ('oneOf' in t) return t;
    let ty = named.get(t.ref);
    if (ty === undefined) {
      const fields = shape.types[t.ref]!;
      ty = { fields: () => record(fields) };
      named.set(t.ref, ty);
    }
    return ty;
  };
  const record = (fields: Readonly<Record<string, ShapeTy>>): Record<string, Ty> =>
    Object.fromEntries(Object.entries(fields).map(([name, t]) => [name, of(t)]));
  return { fields: record(shape.fields), later: shape.later };
}

/** A `later` field once it settled, as the render awaits it: its value or its problem. */
export type SettledField = { readonly ok: unknown } | { readonly error: Problem };

/** What the first frame resolves to: `data`, its `later` fields as promises, and the props. */
export interface FramedData {
  readonly data: Record<string, unknown>;
  readonly layout?: unknown;
}

const HEAD = 0;
const OK = 1;
const ERROR = 2;
/** The length in front of every frame. */
const LENGTH = 4;

/** The type of the first frame: the resolved fields of `data`, and the props as an `any`. */
function headTy(types: DataTypes): Ty {
  const later = new Set(types.later);
  const fields = types.fields;
  const data: Ty =
    fields === undefined
      ? { map: ['str', 'any'] }
      : { fields: () => Object.fromEntries(Object.entries(fields).filter(([name]) => !later.has(name))) };
  return { fields: () => ({ data, layout: { opt: 'any' } }) };
}

/** A `later` field's type: declared, since `later` only exists on a declared field. */
const fieldTy = (types: DataTypes, name: string): Ty => types.fields![name]!;

function frame(kind: number, value: Uint8Array, index = 0): Uint8Array {
  const head = kind === HEAD ? 1 : 2;
  const out = new Uint8Array(LENGTH + head + value.length);
  new DataView(out.buffer).setUint32(0, head + value.length);
  out[LENGTH] = kind;
  out[LENGTH + 1] = index;
  out.set(value, LENGTH + head);
  return out;
}

const encode = (ty: Ty, value: unknown): Uint8Array => binWire.encodeValue(ty, value) as Uint8Array;

/**
 * Write `data` and the props as frames. `data`'s `later` fields are promises that settle to
 * `{ ok }` or `{ error }` and never reject — what `runLoad` leaves in them — and the stream
 * closes once the last one is out.
 */
export function writeFrames(types: DataTypes, data: Readonly<Record<string, unknown>>, layout?: unknown): ReadableStream<Uint8Array> {
  const later = types.later ?? [];
  const resolved = Object.fromEntries(Object.entries(data).filter(([name]) => !later.includes(name)));
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(frame(HEAD, encode(headTy(types), layout === undefined ? { data: resolved } : { data: resolved, layout })));
      await Promise.all(
        later.map(async (name, index) => {
          const settled = (await data[name]) as SettledField;
          controller.enqueue(
            'ok' in settled
              ? frame(OK, encode(fieldTy(types, name), settled.ok), index)
              : frame(ERROR, encode(PROBLEM, settled.error), index),
          );
        }),
      );
      controller.close();
    },
  });
}

/** What a field whose frame never came settles to: the answer was cut short. */
const CUT: SettledField = { error: { status: 500, title: 'The data stream ended early' } };

/**
 * Read the frames of `body`. Resolves with the first one — `data` with every `later` field as
 * a promise of what it settles to — while the rest are still arriving; each promise is kept
 * by its own frame. A field whose frame never comes, because the answer was cut short,
 * settles to a 500 instead of waiting forever. A body that ends before its first frame
 * rejects.
 */
export function readFrames(types: DataTypes, body: ReadableStream<Uint8Array>): Promise<FramedData> {
  const later = types.later ?? [];
  const fields = later.map(() => Promise.withResolvers<SettledField>());
  const keep = fields.map((f) => f.resolve);
  const pending = fields.map((f) => f.promise);
  return new Promise<FramedData>((resolve, reject) => {
    const reader = body.getReader();
    let buffer = new Uint8Array(0);
    let first = true;

    const take = (bytes: Uint8Array): void => {
      const kind = bytes[0]!;
      if (kind === HEAD) {
        const head = binWire.decodeValue(headTy(types), bytes.subarray(1)) as FramedData;
        first = false;
        const data = { ...head.data, ...Object.fromEntries(later.map((name, i) => [name, pending[i]])) };
        resolve(head.layout === undefined ? { data } : { data, layout: head.layout });
        return;
      }
      const index = bytes[1]!;
      const value = bytes.subarray(2);
      keep[index]!(
        kind === OK
          ? { ok: binWire.decodeValue(fieldTy(types, later[index]!), value) }
          : { error: binWire.decodeValue(PROBLEM, value) as Problem },
      );
    };

    const drain = (): void => {
      while (buffer.length >= LENGTH) {
        const size = new DataView(buffer.buffer, buffer.byteOffset).getUint32(0);
        if (buffer.length < LENGTH + size) return;
        take(buffer.subarray(LENGTH, LENGTH + size));
        buffer = buffer.subarray(LENGTH + size);
      }
    };

    const finish = (): void => {
      if (first) reject(new Error('fudic: the data stream ended before its first frame'));
      for (const settle of keep) settle(CUT);
    };

    const pump = async (): Promise<void> => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        const joined = new Uint8Array(buffer.length + value.length);
        joined.set(buffer);
        joined.set(value, buffer.length);
        buffer = joined;
        drain();
      }
    };
    void pump().then(finish, finish);
  });
}
