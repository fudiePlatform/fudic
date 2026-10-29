/**
 * `fud-data` read back by its shape (BUG-60 §3): the arrays `@fudic/ssr` wrote, turned back into
 * the `data` `load` returned.
 *
 * The reading end of a WIRE format: `@fudic/ssr` declares the same shape at the writing end and
 * the two packages depend on neither each other nor a third. A record is an array in the order
 * its fields are declared — a slot beyond its end, or `null`, is an absent field — a list an
 * array, a `map` an object, a `bool` `1`/`0`, an `enum` the index of its member and a `date` its
 * milliseconds. Everything else is as it came.
 */

/** A type of `data`: a primitive by its name, or one of the shapes around it. */
export type DataTy =
  | string
  | { readonly list: DataTy }
  | { readonly opt: DataTy }
  | { readonly map: readonly [DataTy, DataTy] }
  | { readonly oneOf: readonly string[] }
  | { readonly ref: string };

/** The fields of `load`, and every `type` they name by its name. */
export interface DataShape {
  readonly fields: Readonly<Record<string, DataTy>>;
  readonly types: Readonly<Record<string, Readonly<Record<string, DataTy>>>>;
}

/**
 * `data` from what `fud-data` carried. A page that published no block hands over `{}`, which is
 * not a row: it reads as a record with every field absent.
 */
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
