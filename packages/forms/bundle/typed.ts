/**
 * Entry of the `forms/typed` piece (SDD-45 §4.3, third rule): the twelve typed coercions in
 * ONE piece, for the same arithmetic as `bundle/validators.ts`.
 *
 * Each one is a handful of bytes — a range check and a parse — and they are alternatives: a
 * schema that declares a `u8` is not thereby declaring an `f64`. Twelve frontiers to save a
 * hundred bytes each is a toll, not a saving.
 *
 * `typed.ts` and `range.ts` travel inside: they are what all twelve share, and everything that
 * reaches them is here. What they reach in turn — `control` and `internals` — stays outside as
 * a published URL, because those two are reached from elsewhere as well.
 *
 * It lives beside `src` and not inside it because it is an ARTEFACT of the build, not a module
 * of the package: `dist` must not grow a second name for the same values, and `src/**` is the
 * denominator of this package's coverage.
 */

export { u8 } from '../src/typed/u8.js';
export { i8 } from '../src/typed/i8.js';
export { u16 } from '../src/typed/u16.js';
export { i16 } from '../src/typed/i16.js';
export { u32 } from '../src/typed/u32.js';
export { i32 } from '../src/typed/i32.js';
export { f32 } from '../src/typed/f32.js';
export { f64 } from '../src/typed/f64.js';
export { bool } from '../src/typed/bool.js';
export { str } from '../src/typed/str.js';
export { date } from '../src/typed/date.js';
export { arr } from '../src/typed/arr.js';
