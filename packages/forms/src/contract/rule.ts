/**
 * A `rule` of a `.fudapi` (SDD-60 §3.7): the piece the generated module exports, `.check(fn)`
 * for the developer and `.use(params)` for the forms that name it.
 *
 * The check answers a verdict, never an error: `true` when the value passes, `false` (or the
 * code that failed, for a rule with several `fails`) when not. The error and its arguments are
 * built here, from the declaration: `fails min n` with `n = 18` is `{ min: 18 }`, as today.
 */

import { markAsync } from '../async-flag.js';
import { markServer } from '../server-flag.js';
import type { AnyValidator, Errors } from '../types.js';
import { Slot } from './registry.js';

/** What the developer writes: the verdict on a value, given the arguments of the use. */
export type Check<V, P, C extends string = never> = (value: V, params: P) => Verdict<C> | Promise<Verdict<C>>;

/** `true` passes; `false` fails with the first code; a code fails with that one. */
export type Verdict<C extends string> = boolean | C;

export interface RuleSpec {
  /** `<id>` of the `.fudapi` that declares it. */
  readonly id: string;
  /** Its name as written: `min-length`. */
  readonly name: string;
  /** Its `fails`, in order: the code as written and the parameters it reports. */
  readonly fails: readonly (readonly [code: string, params: readonly string[]])[];
  /** `runs server`: skipped by the browser, implemented in `src/server`. */
  readonly server?: boolean;
  readonly async?: boolean;
  /** The browser variant of a `runs server` rule: it can have no implementation here. */
  readonly never?: boolean;
}

export interface Rule<V, P, C extends string = never> {
  /** Registers the implementation. Returns nothing. */
  check(fn: Check<V, P, C>): void;
  /** The validator a field or a `summary` runs, with the arguments of this use. */
  use(params?: P): AnyValidator<V>;
}

/** `nif-unique` → `nifUnique`: the key a code takes in an error map. */
export const camel = (code: string): string => code.replace(/-([a-z0-9])/gu, (_, c: string) => c.toUpperCase());

export function rule<V, P = {}, C extends string = never>(spec: RuleSpec): Rule<V, P, C> {
  const slot = new Slot<Check<V, P, string>>(`${spec.name} of ${spec.id}`, spec.server === true ? 'server' : 'browser', spec.never === true);

  /** The error of a code: `true`, its one parameter, or an object of several. */
  const errorOf = (verdict: string, params: P): Errors => {
    // A code the declaration does not have fails as the first one: the error is always declared.
    const [code, names] = spec.fails.find(([c]) => c === verdict) ?? spec.fails[0]!;
    const values = params as Readonly<Record<string, unknown>>;
    const payload =
      names.length === 0 ? true : names.length === 1 ? values[names[0]!] : Object.fromEntries(names.map((n) => [n, values[n]]));
    return { [camel(code)]: payload };
  };
  const errorFor = (verdict: Verdict<string>, params: P): Errors | null =>
    verdict === true ? null : errorOf(verdict === false ? spec.fails[0]![0] : verdict, params);

  return {
    check: (fn) => slot.set(fn as Check<V, P, string>),
    use: (params = {} as P) => {
      let validator = (value: V): Errors | null | Promise<Errors | null> => {
        const fn = slot.get();
        if (fn === undefined) throw new Error(slot.missing());
        const verdict = fn(value, params);
        return verdict instanceof Promise ? verdict.then((v) => errorFor(v, params)) : errorFor(verdict, params);
      };
      if (spec.server === true) validator = markServer(validator);
      if (spec.async === true) validator = markAsync(validator);
      return validator;
    },
  };
}
