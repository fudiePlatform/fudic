/**
 * The chain of one function (SDD-56 §4.3, §4.4).
 *
 * `compose` folds the levels from the outside in — global, file, function — applying each
 * step in the order it was written, and keeps the halves of the side asked for. `run` walks
 * that list: `next(ctx)` resolves to what the inside returned, an error is a rejection, and a
 * step may call `next` as many times as it likes.
 */

import { halfOf, type AnyStep } from './middleware.js';
import type { Level } from './step.js';
import type { AnyMiddleware, CompressOptions } from './types.js';

export interface Composed {
  /** The halves of the side asked for, outermost first. */
  readonly steps: readonly AnyStep[];
  /** What the innermost level that writes `.compress` set; `false` when none does. */
  readonly compression: CompressOptions | false;
}

export function compose(levels: readonly Level[], side: 'client' | 'server'): Composed {
  let list: readonly AnyMiddleware[] = [];
  let compression: CompressOptions | false = false;

  for (const level of levels) {
    for (const step of level.steps) {
      if (step.kind === 'use') list = [...list, ...step.mws];
      else if (step.kind === 'skip') list = list.filter((mw) => !step.mws.includes(mw));
      else list = [];
    }
    if (level.compression !== undefined) compression = level.compression;
  }

  const steps: AnyStep[] = [];
  for (const mw of list) {
    const half = halfOf(mw, side);
    if (half !== undefined) steps.push(half);
  }
  return { steps, compression };
}

export function run<C>(
  steps: readonly AnyStep[],
  ctx: C,
  last: (ctx: C) => unknown,
): Promise<unknown> {
  const at = async (i: number, c: C): Promise<unknown> => {
    const step = steps[i] as ((c: C, next: (n: C) => Promise<unknown>) => unknown) | undefined;
    return step === undefined ? last(c) : step(c, (n) => at(i + 1, n));
  };
  return at(0, ctx);
}
