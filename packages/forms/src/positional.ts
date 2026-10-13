/**
 * A form without its keys (SDD-56 §4.17): the value in declaration order, a group as its own
 * nested array. Both ends import the same schema, so the names are already known on the other
 * side and only the order travels.
 *
 * Two walks over the schema, one per direction, and nothing else: the schema is the template
 * both ends hold, so neither walk needs the live form.
 */

import type { AnyNode, Schema } from './types.js';

/** A group is a nested form: it carries the schema it was built from. */
const groupSchema = (node: AnyNode): Schema | undefined =>
  '$schema' in node ? node.$schema : undefined;

/** `value` (keyed) → positional, with `undefined` normalised to `null` at any depth. */
export function toPositional(schema: Schema, value: Readonly<Record<string, unknown>>): unknown[] {
  return Object.entries(schema).map(([name, node]) => {
    const inner = groupSchema(node);
    const v = value[name];
    return inner === undefined
      ? normalize(v, [])
      : toPositional(inner, v as Readonly<Record<string, unknown>>);
  });
}

/**
 * Positional → keyed, checked whole before the caller writes anything: a length that is not
 * the level's is a `RangeError`, never an assignment shifted by one.
 */
export function toKeyed(schema: Schema, value: readonly unknown[], path = ''): Record<string, unknown> {
  const entries = Object.entries(schema);
  if (value.length !== entries.length) {
    throw new RangeError(
      `$set: expected ${entries.length} positions${path === '' ? '' : ` at "${path}"`}, got ${value.length}`,
    );
  }
  const out: Record<string, unknown> = {};
  entries.forEach(([name, node], i) => {
    const inner = groupSchema(node);
    const v = value[i];
    const at = path === '' ? name : `${path}.${name}`;
    if (inner === undefined) {
      out[name] = v;
    } else if (Array.isArray(v)) {
      out[name] = toKeyed(inner, v, at);
    } else {
      throw new TypeError(`$set: expected an array at "${at}"`);
    }
  });
  return out;
}

/**
 * `undefined`, a function or a symbol become `null`, at any depth, without touching what the
 * user holds. What is neither a plain object nor an array passes as it is: a `Date` has its
 * own `toJSON`. A cycle is a `TypeError` of its own; a reference two siblings share is not one.
 */
export function normalize(v: unknown, ancestors: readonly object[]): unknown {
  if (v === undefined || typeof v === 'function' || typeof v === 'symbol') return null;
  if (typeof v !== 'object' || v === null) return v;
  const proto: unknown = Object.getPrototypeOf(v);
  if (!Array.isArray(v) && proto !== Object.prototype && proto !== null) return v;
  if (ancestors.includes(v)) {
    throw new TypeError('a form value cannot contain itself: circular reference');
  }
  const path = [...ancestors, v];
  if (Array.isArray(v)) return v.map((item: unknown) => normalize(item, path));
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).map(([k, item]) => [k, normalize(item, path)]),
  );
}
