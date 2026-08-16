/**
 * The range checks the typed factories install.
 *
 * All of them skip `null`, and that is the same rule the shipped validators
 * follow: an empty control is `required`'s business. A declared width says what
 * fits, not that something must be there.
 *
 * A violation is a normal validation error — `{ range: 'u8' }` — published where
 * every other error is published. It never truncates and never throws: silently
 * turning 300 into 44 is how a field ends up storing a number nobody typed.
 */

import type { Errors, TypeTag } from '../types.js';
import type { RangeCheck } from './typed.js';

const fail = (tag: TypeTag): Errors => ({ range: tag });

/** The largest magnitude a 32-bit float can hold. */
export const F32_MAX = 3.4028234663852886e38;

export const intRange =
  (tag: TypeTag, low: number, high: number): RangeCheck =>
  (v) => {
    if (v === null) {
      return null;
    }
    if (typeof v !== 'number' || !Number.isInteger(v) || v < low || v > high) {
      return fail(tag);
    }
    return null;
  };

/**
 * Finite and within the magnitude of the declared width. NOT "exactly
 * representable": `0.1` is not a 32-bit float and refusing it would make `f32`
 * useless for a price, which is what it is for.
 */
export const floatRange =
  (tag: TypeTag, limit: number): RangeCheck =>
  (v) => {
    if (v === null) {
      return null;
    }
    if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > limit) {
      return fail(tag);
    }
    return null;
  };

export const typeOf =
  (tag: TypeTag, expected: 'boolean' | 'string'): RangeCheck =>
  (v) => {
    if (v === null) {
      return null;
    }
    return typeof v === expected ? null : fail(tag);
  };

export const dateRange: RangeCheck = (v) => {
  if (v === null) {
    return null;
  }
  return v instanceof Date && !Number.isNaN(v.getTime()) ? null : fail('date');
};
