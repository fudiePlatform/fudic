/**
 * `group` — a nested form, and literally that: the same builder, with the group's
 * own rules where a root form has its `summary`.
 *
 * A group binds to whatever element the author picks, if it binds to anything at
 * all: what it contributes is error grouping, and where that lands is layout.
 */

import { build } from './form.js';
import type { GroupNode, Schema, Validator, Value } from './types.js';

export function group<S extends Schema>(
  schema: S,
  validators: readonly Validator<Value<S>>[] = [],
): GroupNode<S> {
  return build(schema, {}, validators);
}
