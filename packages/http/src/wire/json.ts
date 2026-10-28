/**
 * The JSON of a function with `use json` (SDD-67 §3.4): its arguments with their keys, its value
 * as JSON and its problem as `application/problem+json`. For clients that are not a fudic page.
 *
 * JSON has no dates: a date leaves as the text its `toJSON` writes. Reading gives back a `Date`
 * wherever the type says there is one — an argument, a field of a form or of a `type`, an element
 * of a list — and leaves everything else as it came, for `conform` or `$set` to judge.
 */

import { conform } from '../contract/wire.js';
import { badRequest, type Problem } from '../errors.js';
import type { Ty } from './ty.js';
import type { Wire } from './wire.js';

const text = new TextDecoder();

function parse(body: Uint8Array): unknown {
  try {
    return JSON.parse(text.decode(body)) as unknown;
  } catch {
    throw badRequest('the body is not valid JSON');
  }
}

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Each declared key by its type; the keys nobody declared, as they came. */
function reviveRecord(types: Readonly<Record<string, Ty>>, v: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, types[k] === undefined ? x : revive(types[k], x)]));
}

function revive(ty: Ty, v: unknown): unknown {
  if (ty === 'date') return typeof v === 'string' ? new Date(v) : v;
  if (typeof ty === 'string' || 'oneOf' in ty) return v;
  if ('opt' in ty) return revive(ty.opt, v);
  if ('list' in ty) return Array.isArray(v) ? v.map((x) => revive(ty.list, x)) : v;
  if (!isRecord(v)) return v;
  if ('map' in ty) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(ty.map[1], x)]));
  return reviveRecord(ty.fields(), v);
}

export const JSON_TYPE = 'application/json';
export const JSON_PROBLEM_TYPE = 'application/problem+json';

export const jsonWire: Wire = {
  name: 'json',
  type: JSON_TYPE,
  problemType: JSON_PROBLEM_TYPE,
  encodeArgs(types, args) {
    const names = Object.keys(types);
    if (names.length === 0) return undefined;
    return JSON.stringify(Object.fromEntries(names.map((n) => [n, args[n]])));
  },
  decodeArgs(types, body) {
    const v = parse(body);
    return isRecord(v) ? reviveRecord(types, v) : {};
  },
  encodeValue: (_ty, value) => JSON.stringify(value),
  decodeValue: (ty, body) => conform(ty, parse(body), 'value'),
  encodeProblem: (problem) => JSON.stringify(problem),
  decodeProblem: (body) => parse(body) as Problem,
};
