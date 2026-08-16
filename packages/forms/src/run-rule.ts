/**
 * The one place where a validator is called, and the one cast in the package that
 * exists for a type and not for a runtime shape.
 *
 * A validator list is declared as `AnyValidator<T>` — root `never` — so that a
 * rule written with its own root type is accepted without a cast at the call site
 * of `control()` or `group()`. Nothing can be passed to a `never` parameter, so
 * the actual call is made through the wide signature. The whole point of the
 * arrangement is where the cast lands: ONE inside the library, none in the rules
 * outside it.
 */

import type { AnyForm, AnyValidator, Errors, Validator } from './types.js';

export const runRule = <T>(
  rule: AnyValidator<T>,
  value: T,
  root: AnyForm,
): Errors | null | Promise<Errors | null> => (rule as Validator<T, AnyForm>)(value, root);
