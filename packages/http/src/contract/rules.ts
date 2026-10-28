/**
 * The rules under the arguments of a function (SDD-67 §3.5, §4.1): the six validators of
 * `@fudic/forms`, run by the browser before anything leaves and by the server before the chain,
 * with the same code and the same `detail`. Skipping the browser skips nothing.
 */

import type { Validator } from '@fudic/forms';
import { badRequest } from '../errors.js';

export interface ArgRule {
  /** The validator of `@fudic/forms/contract`, built with its arguments: `min(18)`. */
  readonly check: Validator<never>;
  /** As written: `min`. */
  readonly name: string;
  /** As written: `[18]`. */
  readonly args: readonly unknown[];
  /** The text written after it: the `detail` when it fails. */
  readonly text?: string;
}

/** What a failed rule says without a text of its own: `argument age: min 18`. */
const detailOf = (arg: string, rule: ArgRule): string =>
  rule.text ?? `argument ${[`${arg}:`, rule.name, ...rule.args.map(String)].join(' ')}`;

/**
 * Argument by argument in declaration order, rule by rule as written: the first that fails is a
 * 400. An absent argument is `null` to a rule, as an empty field is.
 */
export async function checkRules(
  rules: Readonly<Record<string, readonly ArgRule[]>> | undefined,
  values: Readonly<Record<string, unknown>>,
): Promise<void> {
  for (const [arg, list] of Object.entries(rules ?? {})) {
    for (const rule of list) {
      if ((await rule.check((values[arg] ?? null) as never, undefined as never)) !== null) throw badRequest(detailOf(arg, rule));
    }
  }
}
