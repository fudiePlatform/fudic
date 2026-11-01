// The server writes a route's `data` compactly: a record is an array in field order (a
// missing slot or `null` is an absent field), a `bool` is `1`/`0`, an enum is its member's
// index and a `date` its milliseconds.

/** A type of `data`: a primitive by name, or a shape around one. */
export type DataTy =
  | string
  | { readonly list: DataTy }
  | { readonly opt: DataTy }
  | { readonly map: readonly [DataTy, DataTy] }
  | { readonly oneOf: readonly string[] }
  | { readonly ref: string };

/** The fields of `load`'s result, and the named types they use. */
export interface DataShape {
  readonly fields: Readonly<Record<string, DataTy>>;
  readonly types: Readonly<Record<string, Readonly<Record<string, DataTy>>>>;
}

/** Turns what the page carries back into the `data` object. Anything not a row reads as all fields absent. */
export function unpackData(shape: DataShape, raw: unknown): Record<string, unknown> {
  return record(shape.fields, raw, shape);
}

function record(fields: Readonly<Record<string, DataTy>>, raw: unknown, shape: DataShape): Record<string, unknown> {
  const row = Array.isArray(raw) ? (raw as readonly unknown[]) : [];
  const out: Record<string, unknown> = {};
  Object.keys(fields).forEach((name, i) => {
    const x = one(fields[name]!, row[i], shape);
    if (x !== undefined) out[name] = x;
  });
  return out;
}

function one(ty: DataTy, raw: unknown, shape: DataShape): unknown {
  if (raw === undefined || raw === null) return undefined;
  if (typeof ty === 'string') {
    if (ty === 'bool') return raw === 1;
    if (ty === 'date') return new Date(raw as number);
    return raw;
  }
  if ('opt' in ty) return one(ty.opt, raw, shape);
  if ('list' in ty) return (raw as readonly unknown[]).map((x) => one(ty.list, x, shape));
  if ('map' in ty) {
    const [, value] = ty.map;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(raw as object)) {
      const v = one(value, x, shape);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if ('oneOf' in ty) return ty.oneOf[raw as number];
  return record(shape.types[ty.ref]!, raw, shape);
}
