/**
 * The shape of a route's `data`, as the compiler writes it into the page (BUG-60 §3.1): the
 * fields of `load`, and every `type` they reach, at any depth, by its name.
 *
 * Plain JSON, so a host hands it over as it is and the compiler — which does not read contracts
 * — writes it as a literal. A `type` is named, not unfolded, so one that names itself through a
 * list or an optional is one entry; an `enum` is unfolded into its members, because what travels
 * is the index of one. A name the project does not declare is `any` and travels as it is: the
 * validator has already said so.
 */

import type { TypeExpr, TypedField } from './ast.js';
import type { ApiIndex, ApiSource } from './index-api.js';
import { PRIMITIVES } from './types-check.js';

/** A type of `data`: a primitive by its name, or one of the shapes around it. */
export type DataTy =
  | string
  | { readonly list: DataTy }
  | { readonly opt: DataTy }
  | { readonly map: readonly [DataTy, DataTy] }
  | { readonly oneOf: readonly string[] }
  | { readonly ref: string };

export interface DataShape {
  readonly fields: Readonly<Record<string, DataTy>>;
  readonly types: Readonly<Record<string, Readonly<Record<string, DataTy>>>>;
}

/** The shape of what the `load` of `source` returns, or `undefined` when it declares none. */
export function dataShape(source: ApiSource, index: ApiIndex): DataShape | undefined {
  const load = source.file.declarations.find((d) => d.kind === 'load');
  if (load === undefined) return undefined;
  const types: Record<string, Record<string, DataTy>> = {};

  const fieldsOf = (fields: readonly TypedField[]): Record<string, DataTy> =>
    Object.fromEntries(fields.map((f) => [f.name.text, of(f.type)]));

  function of(t: TypeExpr): DataTy {
    switch (t.kind) {
      case 'list':
        return { list: of(t.element) };
      case 'optional':
        return { opt: of(t.inner) };
      case 'map':
        return { map: [of(t.key), of(t.value)] };
      case 'named': {
        const name = t.name.text;
        if (PRIMITIVES.has(name)) return name;
        const decl = index.lookup('type', name)?.decl;
        if (decl === undefined) return 'any';
        if (decl.kind === 'enum') return { oneOf: decl.members.map((m) => m.text) };
        if (!(name in types)) {
          // Claimed before its fields are read: a type that names itself finds itself there.
          types[name] = {};
          types[name] = fieldsOf(decl.fields);
        }
        return { ref: name };
      }
    }
  }

  return { fields: fieldsOf(load.fields), types };
}
