/**
 * The types of a `.fudapi` on the wire (SDD-60 §3.2): every value is checked against its type
 * when it crosses, on both sides. The server answers a 400 whose `detail` names the argument;
 * the browser rejects the call with that same `Problem` and sends nothing.
 *
 * A type travels as a small descriptor the generated module writes: a primitive by its name,
 * the rest as an object. A `type` is a function returning its fields, so a type may name itself
 * through `[]`, `?` or `map`.
 */

import { badRequest } from '../errors.js';

export type Primitive = 'str' | 'bool' | 'u8' | 'i8' | 'u16' | 'i16' | 'u32' | 'i32' | 'f32' | 'f64' | 'date' | 'uuid';

export type Ty =
  | Primitive
  | { readonly list: Ty }
  | { readonly opt: Ty }
  | { readonly map: readonly [Ty, Ty] }
  | { readonly oneOf: readonly string[] }
  | { readonly fields: () => Readonly<Record<string, Ty>> };

const INTEGERS: Readonly<Record<string, readonly [number, number]>> = {
  u8: [0, 255],
  i8: [-128, 127],
  u16: [0, 65_535],
  i16: [-32_768, 32_767],
  u32: [0, 4_294_967_295],
  i32: [-2_147_483_648, 2_147_483_647],
};
const F32_MAX = 3.4028234663852886e38;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** What a type is called in a `detail`. */
function nameOf(ty: Ty): string {
  if (typeof ty === 'string') return ty;
  if ('list' in ty) return `${nameOf(ty.list)}[]`;
  if ('opt' in ty) return `${nameOf(ty.opt)}?`;
  if ('map' in ty) return `map ${nameOf(ty.map[0])} ${nameOf(ty.map[1])}`;
  if ('oneOf' in ty) return ty.oneOf.join(' | ');
  return 'object';
}

const refuse = (path: string, ty: Ty): never => {
  throw badRequest(`${path} is not a valid ${nameOf(ty)}`);
};

function primitive(ty: Primitive, v: unknown, path: string): unknown {
  switch (ty) {
    case 'str':
      return typeof v === 'string' ? v : refuse(path, ty);
    case 'bool':
      return typeof v === 'boolean' ? v : refuse(path, ty);
    case 'uuid':
      return typeof v === 'string' && UUID.test(v) ? v : refuse(path, ty);
    case 'date': {
      const d = v instanceof Date ? v : typeof v === 'string' ? new Date(v) : undefined;
      return d !== undefined && !Number.isNaN(d.getTime()) ? d : refuse(path, ty);
    }
    case 'f32':
    case 'f64': {
      const limit = ty === 'f32' ? F32_MAX : Number.MAX_VALUE;
      return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit ? v : refuse(path, ty);
    }
    default: {
      const [low, high] = INTEGERS[ty]!;
      return typeof v === 'number' && Number.isInteger(v) && v >= low && v <= high ? v : refuse(path, ty);
    }
  }
}

/**
 * `v` as a value of `ty`, or a 400 naming `path`. A date written as text comes back a `Date`;
 * a field an object does not declare is dropped; a missing optional is `undefined`.
 */
export function conform(ty: Ty, v: unknown, path: string): unknown {
  if (typeof ty === 'string') return primitive(ty, v, path);
  if ('opt' in ty) return v === undefined || v === null ? undefined : conform(ty.opt, v, path);
  if ('list' in ty) return Array.isArray(v) ? v.map((x, i) => conform(ty.list, x, `${path}[${i}]`)) : refuse(path, ty);
  if ('oneOf' in ty) return typeof v === 'string' && ty.oneOf.includes(v) ? v : refuse(path, ty);
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return refuse(path, ty);
  const record = v as Readonly<Record<string, unknown>>;
  const out: Record<string, unknown> = {};
  if ('map' in ty) {
    const [key, value] = ty.map;
    for (const [k, x] of Object.entries(record)) {
      fromText(key, k, `${path}.${k}`);
      out[k] = conform(value, x, `${path}.${k}`);
    }
    return out;
  }
  for (const [name, field] of Object.entries(ty.fields())) {
    const x = conform(field, record[name], `${path}.${name}`);
    if (x !== undefined) out[name] = x;
  }
  return out;
}

/** An object of declared arguments, each by its type: `ctx.args`, or what a call sends. */
export function conformAll(types: Readonly<Record<string, Ty>>, v: unknown, what: string): Record<string, unknown> {
  const record = typeof v === 'object' && v !== null ? (v as Readonly<Record<string, unknown>>) : {};
  const out: Record<string, unknown> = {};
  for (const [name, ty] of Object.entries(types)) {
    const x = conform(ty, record[name], `${what} ${name}`);
    if (x !== undefined) out[name] = x;
  }
  return out;
}

/** A value written in a URL — a route segment or a query key — as a value of `ty`. */
export function fromText(ty: Ty, text: string, path: string): unknown {
  const inner = typeof ty !== 'string' && 'opt' in ty ? ty.opt : ty;
  if (inner === 'bool') return text === 'true' ? true : text === 'false' ? false : refuse(path, inner);
  if (inner === 'str' || inner === 'uuid' || inner === 'date' || typeof inner !== 'string') return conform(inner, text, path);
  return conform(inner, text.trim() === '' ? Number.NaN : Number(text), path);
}

/** A scalar as it is written in a URL. */
export const toText = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
