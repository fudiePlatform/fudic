/**
 * What every typed factory shares.
 *
 * A typed control is a `control()` with two things added: the tag, which is inert
 * data for the model and contract for a transport, and a RANGE CHECK installed as
 * its FIRST rule. It goes first because rules stop at the first failure: a value
 * that does not fit the declared width has no business reaching `min(1)` or a rule
 * about the business.
 *
 * The check is also kept reachable under a symbol, because `arr` needs to run its
 * element type's check without knowing which type that is.
 */

import { control } from '../control.js';
import { internalsOf } from '../internals.js';
import type { AnyNode, AnyValidator, Errors, TypeTag, TypedControl, Widen } from '../types.js';

/** A synchronous check of one value against a declared width. */
export type RangeCheck = (v: unknown) => Errors | null;

const RANGE = Symbol('fud.range');

interface WithRange {
  [RANGE]: RangeCheck;
}

/** The writable view used while building. */
type Writable<T> = TypedControl<T> & { type: TypeTag; of?: TypeTag } & WithRange;

export function typed<T>(
  tag: TypeTag,
  initial: T | undefined,
  check: RangeCheck,
  validators: readonly AnyValidator<T>[] | undefined,
  of?: TypeTag,
): TypedControl<T> {
  const rules: readonly AnyValidator<T>[] =
    validators === undefined ? [check] : [check, ...validators];

  const self = control<T>(
    initial,
    rules as readonly AnyValidator<Widen<T>>[],
  ) as unknown as Writable<T>;
  self.type = tag;
  if (of !== undefined) {
    self.of = of;
  }
  self[RANGE] = check;

  // A schema is a template and `form()` clones it, so the clone has to come back
  // typed: without this, `f.qty` inside a form would be a plain control and the
  // declared width would exist only on the object nobody uses.
  const internals = internalsOf(self as unknown as AnyNode);
  internals.clone = () => typed(tag, initial, check, validators, of) as unknown as AnyNode;

  return self;
}

/** The range check of a typed control. Used by `arr`, and by nothing else. */
export const rangeOf = (c: TypedControl<unknown>): RangeCheck => (c as unknown as WithRange)[RANGE];
