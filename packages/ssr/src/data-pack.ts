/**
 * `fud-data` without its keys (BUG-60 §3): what `load` returned, written by its shape.
 *
 * The shape is the `load` of the route's `.fudapi`, which the compiler writes into the page
 * module, so both ends know which value is which and the names never travel. Every level is
 * positional: a record — the root of `data`, a `type` — is an array in the order its fields are
 * declared, with an absent field as `null` and the trailing `null`s dropped. A list is an array
 * of its elements, a `map` stays an object (its keys ARE data), a `bool` is `1`/`0`, an `enum`
 * the index of its member and a `date` its milliseconds. Everything else goes as it is.
 *
 * It is a WIRE format, not a shared type: `@fudic/core` declares the same shape at the reading
 * end, as `fud-state` already does with its markers, and the two packages depend on neither
 * each other nor a third. Writing trusts its value, as the binary of the calls does: `load` is
 * typed by the very shape it is written with.
 */

/** A type of `data`: a primitive by its name, or one of the shapes around it. */
export type DataTy =
  | string
  | { readonly list: DataTy }
  | { readonly opt: DataTy }
  | { readonly map: readonly [DataTy, DataTy] }
  | { readonly oneOf: readonly string[] }
  | { readonly ref: string };

/** The fields of `load`, and every `type` they name by its name — so a type may name itself. */
export interface DataShape {
  readonly fields: Readonly<Record<string, DataTy>>;
  readonly types: Readonly<Record<string, Readonly<Record<string, DataTy>>>>;
}

/** `value` — `data`, or the part of it the client half reads — as its shape writes it. */
export function packData(shape: DataShape, value: unknown): unknown[] {
  return record(shape.fields, value, shape);
}

function record(fields: Readonly<Record<string, DataTy>>, value: unknown, shape: DataShape): unknown[] {
  const from = (value ?? {}) as Readonly<Record<string, unknown>>;
  const row = Object.keys(fields).map((name) => one(fields[name]!, from[name], shape));
  while (row.length > 0 && row[row.length - 1] === null) row.pop();
  return row;
}

function one(ty: DataTy, v: unknown, shape: DataShape): unknown {
  if (v === undefined || v === null) return null;
  if (typeof ty === 'string') {
    if (ty === 'bool') return v === true ? 1 : 0;
    // An invalid date is `NaN`, which JSON writes as `null`: it arrives absent.
    if (ty === 'date') return (v as Date).getTime();
    return v;
  }
  if ('opt' in ty) return one(ty.opt, v, shape);
  if ('list' in ty) return (v as readonly unknown[]).map((x) => one(ty.list, x, shape));
  if ('map' in ty) {
    const [, value] = ty.map;
    return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, one(value, x, shape)]));
  }
  if ('oneOf' in ty) return ty.oneOf.indexOf(v as string);
  return record(shape.types[ty.ref]!, v, shape);
}
