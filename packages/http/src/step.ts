/**
 * One level of a chain, as its builder wrote it (SDD-56 §4.3): the steps in the order they were
 * written, and the compression it sets, if any. The global chain, a file's `http` and a
 * function are each one `Level`, and `compose` folds them from the outside in.
 */

import type { AnyMiddleware, CompressOptions } from './types.js';

export type Step =
  | { readonly kind: 'use'; readonly mws: readonly AnyMiddleware[] }
  | { readonly kind: 'skip'; readonly mws: readonly AnyMiddleware[] }
  | { readonly kind: 'skip-all' };

export interface Level {
  readonly steps: readonly Step[];
  /** What its `.compress(…)` set; absent when this level does not write one. */
  readonly compression?: CompressOptions | false;
}

/** The step a `skip(…)` call writes: `'*'` removes everything inherited. */
export function skipStep(mws: readonly (AnyMiddleware | '*')[]): Step {
  return mws[0] === '*'
    ? { kind: 'skip-all' }
    : { kind: 'skip', mws: mws as readonly AnyMiddleware[] };
}

/** A level with one more step, keeping its compression. */
export function withStep(level: Level, step: Step): Level {
  return { ...level, steps: [...level.steps, step] };
}
