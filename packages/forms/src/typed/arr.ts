/**
 * `arr` — a homogeneous list.
 *
 * The element type is declared by passing ITS FACTORY, `arr(str, [])`, and not a
 * string. A tag would need a table from tag to check somewhere in the package,
 * and a table is exactly the shape a bundler cannot prune: every list would drag
 * every type in. The factory is called once, when the schema is built, to read the
 * tag and the check off a throwaway control.
 */

import { rangeOf, typed } from './typed.js';
import type { Errors, TypedControl, Validator } from '../types.js';
import type { RangeCheck } from './typed.js';

export function arr<T>(
  of: () => TypedControl<T>,
  initial?: readonly T[],
  validators?: readonly Validator<readonly T[]>[],
): TypedControl<readonly T[]> {
  const probe = of();
  const element = rangeOf(probe as TypedControl<unknown>);

  const check: RangeCheck = (v) => {
    if (v === null) {
      return null;
    }
    if (!Array.isArray(v)) {
      return { range: 'arr' } satisfies Errors;
    }
    for (let i = 0; i < v.length; i += 1) {
      if (element(v[i])) {
        return { range: 'arr', at: i, of: probe.type } satisfies Errors;
      }
    }
    return null;
  };

  return typed('arr', initial === undefined ? [] : initial, check, validators, probe.type);
}
