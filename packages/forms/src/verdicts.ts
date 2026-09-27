/**
 * Which asynchronous rules have answered, and for which value (BUG-42 §4.3).
 *
 * The validity never calls a rule marked `asyncValidator`, so it needs to know whether the last
 * validation pass heard back from it FOR THE CURRENT VALUE. A pass stamps each marked rule it
 * runs with the epoch it started at; the rule is settled while that stamp is still the node's
 * epoch, and pending from the moment the value moves.
 *
 * What the rule SAID is not kept here: a failure is published as an error like any other, and
 * the validity reads it there. This only answers "has it spoken".
 */

import { signal, untrack } from '@fudic/core';
import { isAsync } from './async-flag.js';
import { isPending, runRule } from './run-rule.js';
import type { AnyForm, AnyValidator } from './types.js';

export interface Verdicts {
  /** The rules of one pass started at `at`: each marked one records, when it answers, that stamp. */
  watch<T>(rules: readonly AnyValidator<T>[], at: number): readonly AnyValidator<T>[];
  /** Whether `rule` has answered for the value of `epoch`. Tracked. */
  settled(rule: unknown, epoch: number): boolean;
}

export function verdicts(): Verdicts {
  const seen = signal<ReadonlyMap<unknown, number>>(new Map());
  const record = (rule: unknown, at: number): void => {
    seen.set(new Map(untrack(seen)).set(rule, at));
  };
  return {
    watch: <T>(rules: readonly AnyValidator<T>[], at: number): readonly AnyValidator<T>[] =>
      rules.map((rule) => {
        if (!isAsync(rule)) return rule;
        return (value: T, root: never) => {
          const result = runRule(rule, value, root as AnyForm);
          // Marked and yet answering now: its verdict is on record as soon as it returns.
          if (!isPending(result)) {
            record(rule, at);
            return result;
          }
          return result.then((found) => {
            record(rule, at);
            return found;
          });
        };
      }),
    settled: (rule, epoch) => seen().get(rule) === epoch,
  };
}
