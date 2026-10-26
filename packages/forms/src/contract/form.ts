/**
 * The form of a `.fudapi` (SDD-60 §3.6, §4.3): the same `form()` the developer wrote by hand,
 * with its `summary` as a list of rules — every rule and `require` of the block, each failing
 * on its own, as a group's rules do.
 */

import { build } from '../form.js';
import type { AnyValidator, Form, FormOptions, Readable, Schema, TypedControl, Value } from '../types.js';

export function formOf<S extends Schema>(
  schema: S,
  summary: readonly AnyValidator<Value<S>>[] = [],
  options: Omit<FormOptions<S>, 'summary'> = {},
): Form<S> {
  return build(schema, options, summary);
}

/** A form whose value has been validated: `required` fields are typed without `null`. */
export type Validated<F, V> = Omit<F, '$value'> & { readonly $value: Readable<V> };

/** The controls a generated schema names, by the type written in the `.fudapi`. */
export type Str = TypedControl<string>;
export type Bool = TypedControl<boolean>;
export type Num = TypedControl<number | null>;
export type DateField = TypedControl<Date | null>;
export type List<T> = TypedControl<readonly T[]>;
