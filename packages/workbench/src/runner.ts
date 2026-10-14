/**
 * Running several criteria: at most `workers` at a time, each in its own page, the ones that did
 * not pass last time first. Results are handed over as they finish, not in order: the shell and
 * the editor place each one by its id.
 */

import type { CriterionResult } from './engine.js';
import type { PlannedCriterion } from './pages.js';
import type { Verdict } from './protocol.js';

/** How many criteria run at once by default. */
export const DEFAULT_WORKERS = 4;

/** The criteria whose last verdict was not `pass` (or that never ran) first, in `.fudspec` order. */
export function runOrder(
  criteria: readonly PlannedCriterion[],
  verdicts: ReadonlyMap<string, Verdict>,
): PlannedCriterion[] {
  const passed = (c: PlannedCriterion) => verdicts.get(c.id) === 'pass';
  return [...criteria.filter((c) => !passed(c)), ...criteria.filter(passed)];
}

export interface PoolInput {
  readonly criteria: readonly PlannedCriterion[];
  readonly workers: number;
  /** Aborted by a cancel: no criterion starts after it, and the running ones are discarded. */
  readonly signal: AbortSignal;
  run(criterion: PlannedCriterion, signal: AbortSignal): Promise<CriterionResult>;
  /** A criterion that finished before any cancel. */
  done(result: CriterionResult): void;
}

/** Runs the criteria; answers the ids that did not finish because of a cancel. */
export async function runPool(input: PoolInput): Promise<string[]> {
  const unfinished: string[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < input.criteria.length) {
      const criterion = input.criteria[next++]!;
      if (input.signal.aborted) {
        unfinished.push(criterion.id);
        continue;
      }
      const result = await input.run(criterion, input.signal);
      if (input.signal.aborted) unfinished.push(criterion.id);
      else input.done(result);
    }
  };
  const count = Math.max(1, Math.min(input.workers, input.criteria.length));
  await Promise.all(Array.from({ length: count }, worker));
  return unfinished;
}
