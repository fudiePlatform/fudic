/**
 * What the `load` of a route returns, as the fields a new fixture writes a sample for (SDD-82
 * §3.10): `fudic g spec /<route>` and the editor's light bulb both write the `data` of a page's
 * fixture from these, so the terminal and the editor never write two different files.
 *
 * Read off the `.fudapi`, not off TypeScript: the contract already says what each field is, and
 * the `.d.ts` is only its projection. A `later` field is read as what it resolves to, because a
 * fixture may hand the value itself (`FixtureOf`). What a fixture cannot write as a literal — a
 * `date`, an `html`, a `file`, a type the project does not declare — is `opaque`, and its field is
 * left out of the sample: the check then says it is missing, and the author decides what it holds.
 */

import { framesShape, type ApiIndex, type ApiSource, type DataTy } from '@fudic/api';
import type { PropField, PropShape } from '@fudic/spec';

const OPAQUE: PropShape = { kind: 'opaque' };

/** The primitives by their meaning in a fixture; any other primitive is a number width. */
const BY_NAME: Readonly<Record<string, PropShape>> = {
  str: { kind: 'string' },
  uuid: { kind: 'string' },
  bool: { kind: 'boolean' },
  date: OPAQUE,
  html: OPAQUE,
  file: OPAQUE,
  any: { kind: 'any' },
};

/** A type without its `?`: an optional field is one a fixture may leave out, and `T` fits it. */
const bare = (ty: DataTy): Exclude<DataTy, { readonly opt: DataTy }> => (typeof ty === 'object' && 'opt' in ty ? bare(ty.opt) : ty);

/** The fields of what the `load` of `source` returns; undefined when it declares no `load`. */
export function loadFields(source: ApiSource, index: ApiIndex): readonly PropField[] | undefined {
  const shape = framesShape(source, index);
  if (shape === undefined) return undefined;
  const fieldsOf = (fields: Readonly<Record<string, DataTy>>, path: ReadonlySet<string>): readonly PropField[] =>
    Object.entries(fields).map(([name, ty]) => ({ name, required: bare(ty) === ty, shape: of(ty, path) }));
  // `path` holds the types being described above this one: meeting one again is a cycle.
  const of = (written: DataTy, path: ReadonlySet<string>): PropShape => {
    const ty = bare(written);
    if (typeof ty === 'string') return BY_NAME[ty] ?? { kind: 'number' };
    if ('list' in ty) return { kind: 'array', element: of(ty.list, path) };
    if ('map' in ty) return { kind: 'record' };
    if ('oneOf' in ty) return { kind: 'union', members: ty.oneOf.map((value) => ({ kind: 'literal', value })) };
    if (path.has(ty.ref)) return OPAQUE;
    return { kind: 'object', props: fieldsOf(shape.types[ty.ref]!, new Set(path).add(ty.ref)) };
  };
  return fieldsOf(shape.fields, new Set());
}
