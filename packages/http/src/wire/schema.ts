/**
 * A form's schema as the type it travels as (SDD-67 §3.1): a group is a `type`; `u8`…`f64`,
 * `date` and `arr` are optional, since an empty field is `null`; `bool` and `str` are not; an
 * `arr` of `T` is `T[]`. With that, a form is one more level and its bytes are those of SDD-56.
 *
 * Its own module: only a page with a function that takes a form imports it.
 */

import type { AnyNode, Schema, TypeTag, TypedControl } from '@fudic/forms';
import type { Ty } from './ty.js';

/** The tags that are never `null`. */
const REQUIRED: ReadonlySet<TypeTag> = new Set<TypeTag>(['bool', 'str']);

export function tyOfSchema(schema: Schema): Ty {
  const fields = formTypes(schema);
  return { fields: () => fields };
}

/** The controls of a form as the arguments of a call: the body of a function that takes it. */
export function formTypes(schema: Schema): Record<string, Ty> {
  return Object.fromEntries(Object.entries(schema).map(([name, node]) => [name, tyOfNode(name, node)]));
}

function tyOfNode(name: string, node: AnyNode): Ty {
  if ('$schema' in node) return tyOfSchema(node.$schema);
  const { type, of } = node as Partial<TypedControl<unknown>>;
  if (type === undefined) {
    throw new TypeError(`control "${name}" declares no type: a form travels by the types of its controls`);
  }
  const ty: Ty = type === 'arr' ? { list: of as Exclude<TypeTag, 'arr'> } : type;
  return REQUIRED.has(type) ? ty : { opt: ty };
}
