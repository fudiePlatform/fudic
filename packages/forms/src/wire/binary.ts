/**
 * A typed form in binary (SDD-56 §4.18). ONE walk over the schema serves both directions:
 * `writeBinary` hands it a `Writer` and the value, `readBinary` a `Reader` and nothing, and
 * every byte is written and read by the same line. Touching one direction without the other
 * is a bug, not a variant.
 *
 * Each level — the form and every group — is written in line, in its position: the null map
 * of its controls that admit `null`, the bit field of its `bool`s, then each remaining value
 * in declaration order.
 */

import type { AnyNode, Positional, Schema, TypeTag, TypedControl } from '../types.js';
import { Reader, Writer, type Io, type Width } from './io.js';

/** The tags that admit `null`, and so own a bit of their level's null map. */
const NULLABLE: ReadonlySet<TypeTag> = new Set<TypeTag>([
  'u8', 'i8', 'u16', 'i16', 'u32', 'i32', 'f32', 'f64', 'date', 'arr',
]);

/** 48 bits, signed: ±4 459 years around 1970. */
const DATE_LIMIT = 2 ** 47;

type Node = { readonly group: Schema } | { readonly control: TypedControl<unknown> };

/** A schema node as the walk sees it; `undefined` for a control without a type. */
function nodeOf(node: AnyNode): Node | undefined {
  if ('$schema' in node) return { group: node.$schema };
  return 'type' in node ? { control: node as TypedControl<unknown> } : undefined;
}

/** Whether every control of the schema declares its type, so the form can travel in binary. */
export function isTyped(schema: Schema): boolean {
  return Object.values(schema).every((node) => {
    const n = nodeOf(node);
    return n !== undefined && ('group' in n ? isTyped(n.group) : true);
  });
}

/**
 * Whether this value of a typed schema fits the format: no `null` inside an `arr` or where
 * the tag does not admit one, and every date within 48 bits. Ranges are not checked here: the
 * client's validation already did, with each typed control's first rule.
 */
export function representable(schema: Schema, value: readonly unknown[]): boolean {
  return Object.values(schema).every((node, i) => {
    const n = nodeOf(node) as Node;
    const v = value[i];
    if ('group' in n) return representable(n.group, v as readonly unknown[]);
    const { type, of } = n.control;
    if (v === null) return NULLABLE.has(type);
    if (type === 'date') return fitsDate(v as Date);
    if (type !== 'arr') return true;
    return (v as readonly unknown[]).every((item) => item !== null && (of !== 'date' || fitsDate(item as Date)));
  });
}

const fitsDate = (d: Date): boolean => Math.abs(d.getTime()) < DATE_LIMIT;

export function writeBinary<S extends Schema>(schema: S, value: Positional<S>): Uint8Array {
  const writer = new Writer();
  level(schema, value, writer);
  return writer.bytes();
}

export function readBinary<S extends Schema>(schema: S, bytes: Uint8Array): Positional<S> {
  const reader = new Reader(bytes);
  const value = level(schema, undefined, reader);
  if (!reader.done()) throw new RangeError('binary body: longer than its schema');
  return value as unknown as Positional<S>;
}

/** One level, in line: null map, bit field, values. `value` is absent when reading. */
function level(schema: Schema, value: readonly unknown[] | undefined, io: Io): unknown[] {
  const nodes = Object.values(schema).map((node) => nodeOf(node) as Node);
  const at = (i: number): unknown => value?.[i];
  const tagged = (pick: (type: TypeTag) => boolean): number[] =>
    nodes.flatMap((n, i) => ('control' in n && pick(n.control.type) ? [i] : []));

  const nullable = tagged((type) => NULLABLE.has(type));
  const bools = tagged((type) => type === 'bool');
  const out: unknown[] = new Array<unknown>(nodes.length);
  const done = new Set<number>();

  const nulls = io.bits(nullable.length, value && nullable.map((i) => at(i) === null));
  nullable.forEach((i, k) => {
    if (nulls[k] === true) {
      out[i] = null;
      done.add(i);
    }
  });
  const flags = io.bits(bools.length, value && bools.map((i) => at(i) === true));
  bools.forEach((i, k) => {
    out[i] = flags[k];
    done.add(i);
  });

  nodes.forEach((n, i) => {
    if (done.has(i)) return;
    out[i] =
      'group' in n
        ? level(n.group, at(i) as readonly unknown[] | undefined, io)
        : one(n.control.type, n.control.of, at(i), io);
  });
  return out;
}

/** One value that is neither a `bool` nor `null`. */
function one(type: TypeTag, of: TypeTag | undefined, v: unknown, io: Io): unknown {
  if (type === 'date') return io.date(v as Date | undefined);
  if (type === 'str') return io.str(v as string | undefined);
  if (type === 'arr') {
    const items = v as readonly unknown[] | undefined;
    const count = io.varint(items?.length);
    const element = of as TypeTag;
    if (element === 'bool') return io.bits(count, items as readonly boolean[] | undefined);
    return Array.from({ length: count }, (_, k) => one(element, undefined, items?.[k], io));
  }
  return io.num(type as Width, v as number | undefined);
}
