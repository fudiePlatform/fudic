/**
 * A form that travelled as JSON, read back against its schema: positional (`application/fud`)
 * or with its keys (`application/json` to a function with `.form`).
 *
 * JSON has no dates: a `date()` control leaves as the string its `toJSON` writes. So the reader
 * gives each `date` control, and each element of an `arr` of dates, its `Date` back; everything
 * else is already what it was. What does not have the shape of the schema is left alone, for
 * `$set` to refuse.
 */

import type { AnyNode, Schema, TypedControl } from '../types.js';

export function reviveJson(schema: Schema, value: unknown): unknown {
  const entries = Object.entries(schema);
  if (Array.isArray(value)) {
    if (value.length !== entries.length) return value;
    return entries.map(([, node], i) => revive(node, value[i]));
  }
  if (value === null || typeof value !== 'object') return value;
  const keyed = value as Readonly<Record<string, unknown>>;
  return Object.fromEntries(
    Object.entries(keyed).map(([key, v]) => {
      const node = schema[key];
      return [key, node === undefined ? v : revive(node, v)];
    }),
  );
}

function revive(node: AnyNode, v: unknown): unknown {
  if ('$schema' in node) return reviveJson(node.$schema, v);
  const { type, of } = node as Partial<TypedControl<unknown>>;
  if (type === 'date') return asDate(v);
  if (type === 'arr' && of === 'date' && Array.isArray(v)) return v.map(asDate);
  return v;
}

const asDate = (v: unknown): unknown => (typeof v === 'string' ? new Date(v) : v);
