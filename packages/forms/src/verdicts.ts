/**
 * Which asynchronous rules have answered, and for which value (BUG-42 §4.3).
 *
 * The validity never calls a rule marked `asyncValidator`, so it needs to know whether the last
 * validation pass heard back from it FOR THE CURRENT VALUE. A pass stamps each marked rule it
 * runs with the epoch it started at; the rule is settled while that stamp is still the node's
 * epoch, and pending from the moment the value moves.
 *
 * What the rule SAID is not kept here: a failure is published as an error like any other, and
 * the validity reads it there. This only answers "has it spoken" — and, for `pending()`
 * (SDD-80 §3.4), "has it been asked": a rule asked for the current value that has not spoken yet
 * is pending. One never asked is not: a field nobody validated is not waiting for anything.
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
  /** Whether some rule was asked for the value of `epoch` and has not answered it. Tracked. */
  pending(epoch: number): boolean;
}

export function verdicts(): Verdicts {
  const seen = signal<ReadonlyMap<unknown, number>>(new Map());
  /**
   * The last question put to each marked rule: the epoch it was about and its ticket. Pending
   * lasts until THAT question answers — an older one answering for the same value (a pass run
   * twice: `change` and `blur` on leaving a field) does not end the wait of the newer one.
   */
  const asked = signal<ReadonlyMap<unknown, { readonly at: number; readonly ticket: number }>>(new Map());
  /** The ticket of the last question each rule answered. */
  const heard = signal<ReadonlyMap<unknown, number>>(new Map());
  let tickets = 0;
  const stamp = <V>(map: { (): ReadonlyMap<unknown, V>; set(v: ReadonlyMap<unknown, V>): void }, rule: unknown, v: V): void => {
    map.set(new Map(untrack(map)).set(rule, v));
  };
  return {
    watch: <T>(rules: readonly AnyValidator<T>[], at: number): readonly AnyValidator<T>[] =>
      rules.map((rule) => {
        if (!isAsync(rule)) return rule;
        return (value: T, root: never, ctx?: unknown) => {
          const result = runRule(rule, value, root as AnyForm, ctx);
          // Marked and yet answering now: its verdict is on record as soon as it returns.
          if (!isPending(result)) {
            stamp(seen, rule, at);
            return result;
          }
          const ticket = (tickets += 1);
          stamp(asked, rule, { at, ticket });
          return result.then((found) => {
            stamp(seen, rule, at);
            stamp(heard, rule, ticket);
            return found;
          });
        };
      }),
    settled: (rule, epoch) => seen().get(rule) === epoch,
    pending: (epoch) => {
      const answered = heard();
      return [...asked()].some(([rule, { at, ticket }]) => at === epoch && answered.get(rule) !== ticket);
    },
  };
}
