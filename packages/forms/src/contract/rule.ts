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

/**
 * What the developer writes: the verdict on a value, given the arguments of the use. A rule the
 * server runs (`runs server`, `runs remote`) is given a third argument, `X`: the server's `ctx`
 * with what the middlewares of its `use`s add (SDD-80 §3.2). A `runs both` rule has none.
 */
export type Check<V, P, C extends string = never, X = never> = [X] extends [never]
  ? (value: V, params: P) => Verdict<C> | Promise<Verdict<C>>
  : (value: V, params: P, ctx: X) => Verdict<C> | Promise<Verdict<C>>;

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
  /**
   * `runs remote` (SDD-80 §4.2): the server checks it, and the browser asks it while the user
   * types. Its browser variant has no implementation either, and no `never`: it asks.
   */
  readonly remote?: boolean;
  /** Of a remote rule, in the browser: milliseconds between the last keystroke and the question. */
  readonly debounce?: number;
  /** Of a remote rule: the types of the value it asks about and of the parameters of the use. */
  readonly value?: unknown;
  readonly params?: unknown;
  /** Of a remote rule: the format of its question (`binWire`, or `jsonWire` with `use json`). */
  readonly wire?: unknown;
  /** Of a remote rule in `fud-bin`: the signature of its question. */
  readonly sig?: string;
  /** On the server, of a rule the server runs: the levels of middlewares around its check. */
  readonly chain?: readonly unknown[];
}

export interface Rule<V, P, C extends string = never, X = never> {
  /** Registers the implementation. Returns nothing. */
  check(fn: Check<V, P, C, X>): void;
  /** The validator a field or a `summary` runs, with the arguments of this use. */
  use(params?: P): AnyValidator<V>;
}

/** `nif-unique` → `nifUnique`: the key a code takes in an error map. */
export const camel = (code: string): string => code.replace(/-([a-z0-9])/gu, (_, c: string) => c.toUpperCase());

/**
 * How the server runs levels of middlewares around a check (SDD-80 §3.2): `inner` is the check,
 * given the `ctx` the levels leave. The chain is `@fudic/http`'s, which depends on this package
 * and not the other way round, so it hands its runner in (`runRulesWith`) before it validates.
 */
export type Around = (levels: readonly unknown[], ctx: unknown, inner: (ctx: unknown) => Promise<unknown>) => Promise<unknown>;

let around: Around | undefined;

/** Installs the runner of the levels around a rule's check. What `@fudic/http` calls on the server. */
export function runRulesWith(fn: Around): void {
  around = fn;
}

/** A `runs remote` rule on the server, as its route reads it (SDD-80 §3.3, §4.4). */
export interface RemoteRule {
  readonly spec: RuleSpec;
  /** Whether `src/server` implemented it. */
  implemented(): boolean;
  /** What a question without an implementation is told: `… has no implementation in src/server`. */
  missing(): string;
  /**
   * The verdict on `value` with the parameters of a use, through its whole chain — `$global` and
   * its own middlewares — given the `ctx` of the request: `null` when it passes, else the code
   * that failed.
   */
  ask(value: unknown, params: unknown, ctx: unknown): Promise<string | null>;
}

/** The remote rules loaded in this process, by `<id>` and name. */
const remotes = new Map<string, Map<string, RemoteRule>>();

/** The remote rule `name` of `<id>`, or `undefined`: a `runs server` rule is never here. */
export const remoteRule = (id: string, name: string): RemoteRule | undefined => remotes.get(id)?.get(name);

/** What the check of any rule is, as the server calls it: with the `ctx` last. */
type AnyCheck = (value: unknown, params: unknown, ctx?: unknown) => Verdict<string> | Promise<Verdict<string>>;

export function rule<V, P = {}, C extends string = never, X = never>(spec: RuleSpec): Rule<V, P, C, X> {
  // The browser variant of a remote rule is the only one without `server`: it asks, it is never implemented here.
  const remoteHere = spec.remote === true && spec.server !== true;
  const side = spec.server === true || spec.remote === true ? 'server' : 'browser';
  const label = `${spec.name} of ${spec.id}`;
  const slot = new Slot<AnyCheck>(label, side, spec.never === true || remoteHere);

  /** The code a verdict fails with, or `null`. A code the declaration does not have fails as the first one. */
  const codeOf = (verdict: Verdict<string>): string | null => {
    if (verdict === true) return null;
    const first = spec.fails[0]![0];
    return verdict === false || !spec.fails.some(([c]) => c === verdict) ? first : verdict;
  };
  /** The error of a code: `true`, its one parameter, or an object of several. */
  const errorOf = (code: string, params: P): Errors => {
    const names = spec.fails.find(([c]) => c === code)![1];
    const values = params as Readonly<Record<string, unknown>>;
    const payload =
      names.length === 0 ? true : names.length === 1 ? values[names[0]!] : Object.fromEntries(names.map((n) => [n, values[n]]));
    return { [camel(code)]: payload };
  };
  const errorFor = (verdict: Verdict<string>, params: P): Errors | null => {
    const code = codeOf(verdict);
    return code === null ? null : errorOf(code, params);
  };

  /**
   * The check, inside `levels` of middlewares. Without levels it is called as it is; with them,
   * through the runner `@fudic/http` installed — and never without it: a declared `auth` that
   * nothing runs must not let the check through.
   */
  const checked = (value: unknown, params: unknown, ctx: unknown, levels: readonly unknown[]): Verdict<string> | Promise<Verdict<string>> => {
    const fn = slot.get();
    if (fn === undefined) throw new Error(slot.missing());
    if (levels.length === 0) return fn(value, params, ctx);
    if (around === undefined) throw new Error(`${label} has middlewares and nothing runs them: it runs on the server, through @fudic/http`);
    return around(levels, ctx, async (inner) => fn(value, params, inner)) as Promise<Verdict<string>>;
  };

  // On a submit the server has already run `$global` around the function: a rule runs its own level (SDD-80 §4.4).
  const own = spec.chain === undefined ? [] : spec.chain.slice(-1);

  if (spec.remote === true && spec.server === true) {
    const byName = remotes.get(spec.id) ?? new Map<string, RemoteRule>();
    remotes.set(spec.id, byName);
    byName.set(spec.name, {
      spec,
      implemented: () => slot.get() !== undefined,
      missing: () => slot.missing(),
      // Its route runs the whole chain: nothing ran `$global` before it.
      ask: async (value, params, ctx) => codeOf(await checked(value, params, ctx, spec.chain ?? [])),
    });
  }

  return {
    check: (fn) => slot.set(fn as AnyCheck),
    use: (params = {} as P) => {
      let validator = (value: V, _root?: unknown, ctx?: unknown): Errors | null | Promise<Errors | null> => {
        const verdict = checked(value, params, ctx, own);
        return verdict instanceof Promise ? verdict.then((v) => errorFor(v, params)) : errorFor(verdict, params);
      };
      // Until the browser asks a remote rule (SDD-80 §4.3), it skips it as a server one: the submit checks it.
      if (spec.server === true || remoteHere) validator = markServer(validator);
      if (spec.async === true) validator = markAsync(validator);
      return validator;
    },
  };
}
