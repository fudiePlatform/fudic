/**
 * `fud-bin` (SDD-67 §3.1): the binary format of every call, the one of SDD-56 §4.18 extended to
 * every type of the `.fudapi`. ONE walk over the types serves both directions: writing hands it a
 * `Writer` and the value, reading a `Reader` and nothing, and every byte is written and read by
 * the same line. Touching one direction without the other is a bug, not a variant.
 *
 * A level — the arguments of a call, the fields of a `type`, the elements of a list, the keys or
 * the values of a map — is written in line: the null map of its optional slots, the bits of its
 * `bool`s, then each remaining value in order.
 *
 * Writing trusts its value: it is written once it passed `conform`. Reading trusts nothing, and
 * whatever does not hold is a 400 whose `detail` starts with `binary body:` (§4.2).
 */

import { conform, fromText, toText } from '../contract/wire.js';
import { badRequest, type Problem } from '../errors.js';
import { Reader, Writer, type Io, type Width } from './io.js';
import { PROBLEM } from './problem.js';
import type { Ty } from './ty.js';
import type { Wire } from './wire.js';

const isOpt = (ty: Ty): ty is { readonly opt: Ty } => typeof ty !== 'string' && 'opt' in ty;
const inner = (ty: Ty): Ty => (isOpt(ty) ? ty.opt : ty);
const absent = (v: unknown): boolean => v === undefined || v === null;

/** One level, in line: null map, bits, values. `values` is absent when reading. */
function level(slots: readonly Ty[], values: readonly unknown[] | undefined, io: Io): unknown[] {
  const out = new Array<unknown>(slots.length);
  const done = new Set<number>();

  const opts = slots.flatMap((ty, i) => (isOpt(ty) ? [i] : []));
  const nulls = io.bits(opts.length, values && opts.map((i) => absent(values[i])));
  opts.forEach((i, k) => {
    if (nulls[k] === true) {
      out[i] = null;
      done.add(i);
    }
  });

  const bools = slots.flatMap((ty, i) => (!done.has(i) && inner(ty) === 'bool' ? [i] : []));
  const flags = io.bits(bools.length, values && bools.map((i) => values[i] === true));
  bools.forEach((i, k) => {
    out[i] = flags[k];
    done.add(i);
  });

  slots.forEach((ty, i) => {
    if (!done.has(i)) out[i] = one(inner(ty), values?.[i], io);
  });
  return out;
}

/** `count` slots of the same type: the elements of a list, the keys or values of a map. */
const same = (ty: Ty, count: number): Ty[] => new Array<Ty>(count).fill(ty);

/** One value that is present and not a `bool`. */
function one(ty: Ty, v: unknown, io: Io): unknown {
  switch (ty) {
    case 'str':
    case 'html':
      return io.str(v as string | undefined);
    case 'date':
      return io.date(v as Date | undefined);
    case 'uuid':
      return uuidText(io.raw(16, v === undefined ? undefined : uuidBytes(v as string)));
    case 'any':
      return anyValue(v, io);
  }
  if (typeof ty === 'string') return io.num(ty as Width, v as number | undefined);
  if ('list' in ty) {
    const items = v as readonly unknown[] | undefined;
    const count = io.varint(items?.length);
    // Every element takes at least one bit: its null bit, its bool bit, or a byte. One of a
    // `type` without fields takes none, and a list of them is still held to one bit each.
    io.claim(count);
    return level(same(ty.list, count), items, io);
  }
  if ('map' in ty) return mapValue(ty.map, v, io);
  if ('oneOf' in ty) {
    const index = io.varint(v === undefined ? undefined : ty.oneOf.indexOf(v as string));
    if (index >= ty.oneOf.length) throw new RangeError(`binary body: enum index ${index} of ${ty.oneOf.length}`);
    return ty.oneOf[index];
  }
  const fields = (ty as { readonly fields: () => Readonly<Record<string, Ty>> }).fields();
  const names = Object.keys(fields);
  const record = v as Readonly<Record<string, unknown>> | undefined;
  const read = level(names.map((n) => fields[n]!), record && names.map((n) => record[n]), io);
  return Object.fromEntries(names.map((n, i) => [n, read[i]]));
}

/** A map: its count, its keys as a level of their type, its values as another. */
function mapValue([key, value]: readonly [Ty, Ty], v: unknown, io: Io): Record<string, unknown> {
  const entries = v === undefined ? undefined : Object.entries(v as Readonly<Record<string, unknown>>);
  const count = io.varint(entries?.length);
  io.claim(count * 2);
  // A key of an object is text: it is written as its type and read back as text (§4.2).
  const keys = level(same(key, count), entries?.map(([k]) => fromText(key, k, 'key')), io);
  const values = level(same(value, count), entries?.map(([, x]) => x), io);
  return Object.fromEntries(keys.map((k, i) => [toText(k), values[i]]));
}

/** The tag of an `any` (§3.1): null, false, true, number, text, list, object. */
function tagOf(v: unknown): number {
  if (v === null) return 0;
  if (typeof v === 'boolean') return v ? 2 : 1;
  if (typeof v === 'number') return 3;
  if (typeof v === 'string') return 4;
  return Array.isArray(v) ? 5 : 6;
}

/**
 * A validator's value, behind its tag. Writing never meets `undefined`: an element of a list is
 * written as `null`, and a key of an object that holds it is left out, as JSON would.
 */
function anyValue(v: unknown, io: Io): unknown {
  const tag = io.num('u8', v === undefined ? undefined : tagOf(v));
  switch (tag) {
    case 0:
      return null;
    case 1:
      return false;
    case 2:
      return true;
    case 3:
      return io.num('f64', v as number | undefined);
    case 4:
      return io.str(v as string | undefined);
    case 5: {
      const items = (v as readonly unknown[] | undefined)?.map((x) => (x === undefined ? null : x));
      const count = io.varint(items?.length);
      io.claim(count * 8);
      return Array.from({ length: count }, (_, k) => anyValue(items?.[k], io));
    }
    case 6: {
      const entries = v === undefined ? undefined : Object.entries(v as object).filter(([, x]) => x !== undefined);
      const count = io.varint(entries?.length);
      io.claim(count * 16);
      return Object.fromEntries(
        Array.from({ length: count }, (_, k) => [io.str(entries?.[k]![0]), anyValue(entries?.[k]![1], io)]),
      );
    }
    default:
      throw new RangeError(`binary body: an any with tag ${tag}`);
  }
}

/** The 32 hexadecimal digits of a uuid, in the order they are written, two to a byte. */
function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replaceAll('-', '');
  return Uint8Array.from({ length: 16 }, (_, i) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16));
}

function uuidText(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function write(slots: readonly Ty[], values: readonly unknown[]): Uint8Array {
  const writer = new Writer();
  level(slots, values, writer);
  return writer.bytes();
}

/** A body read whole, or a 400: what is left over is not this level's either. */
function read(slots: readonly Ty[], body: Uint8Array): unknown[] {
  const reader = new Reader(body);
  try {
    const values = level(slots, undefined, reader);
    if (!reader.done()) throw new RangeError('binary body: longer than its schema');
    return values;
  } catch (e) {
    throw badRequest((e as Error).message);
  }
}

export const BIN_TYPE = 'application/fud+bin';
export const BIN_PROBLEM_TYPE = 'application/problem+fud';

export const binWire: Wire = {
  name: 'fud-bin',
  type: BIN_TYPE,
  problemType: BIN_PROBLEM_TYPE,
  encodeArgs(types, args) {
    const names = Object.keys(types);
    if (names.length === 0) return undefined;
    return write(names.map((n) => types[n]!), names.map((n) => args[n]));
  },
  decodeArgs(types, body) {
    const names = Object.keys(types);
    const values = read(names.map((n) => types[n]!), body);
    return Object.fromEntries(names.map((n, i) => [n, values[i]]));
  },
  encodeValue: (ty, value) => write([ty], [value]),
  // An optional slot reads back as `null`; `conform` turns it into the absent key the type says.
  decodeValue: (ty, body) => conform(ty, read([ty], body)[0], 'value'),
  encodeProblem: (problem) => write([PROBLEM], [problem]),
  decodeProblem: (body) => binWire.decodeValue(PROBLEM, body) as Problem,
};
