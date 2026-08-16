/**
 * `group` — a nested form, and literally that: the same builder, with the group's
 * own rules where a root form has its `summary`.
 *
 * A group binds to whatever element the author picks, if it binds to anything at
 * all: what it contributes is error grouping, and where that lands is layout.
 */

import { build } from './form.js';
import type { AnyValidator, GroupNode, Schema, Value } from './types.js';

/**
 * `NoInfer` on the rules, or a rule written against the group's value would take
 * part in inferring the schema and drag it back to its constraint — which loses
 * the field types of every schema that contains a group.
 *
 * One combination still defeats inference and it is worth knowing: a schema
 * written INLINE together with a rule that was declared apart and annotated by
 * hand. TypeScript then falls back to `Schema` and the fields lose their types.
 * Either write the rule inline, or give the schema its own `const` — which is how
 * a schema is written anyway, since it is a template both ends import.
 */
export function group<S extends Schema>(
  schema: S,
  validators: readonly AnyValidator<NoInfer<Value<S>>>[] = [],
): GroupNode<S> {
  return build(schema, {}, validators as readonly AnyValidator<Value<S>>[]);
}
