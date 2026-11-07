/**
 * SDD-80 §3.2, §4.2, §4.4 — a rule the server runs: its check is given the server's `ctx`, its
 * middlewares run around it through the runner `@fudic/http` installs, and a `runs remote` rule is
 * registered for its route, which asks it through its whole chain.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { form } from '../../src/form.js';
import { control } from '../../src/control.js';
import { remoteRule, resetRegistry, rule, runRulesWith, type Around, type RuleSpec } from '../../src/contract/index.js';
import type { AnyForm, Errors } from '../../src/types.js';

afterEach(() => {
  resetRegistry();
});

/** Runs a validator with no form around it, given a `ctx`. */
const run = (v: unknown, value: unknown, ctx?: unknown): Errors | null | Promise<Errors | null> =>
  (v as (x: unknown, root: AnyForm, ctx?: unknown) => Errors | null)(value, undefined as unknown as AnyForm, ctx);

/** A runner that writes down the levels it was given and adds `user` to the `ctx`. */
function runner(levels: unknown[][]): Around {
  return async (given, ctx, inner) => {
    levels.push([...given]);
    return inner({ ...(ctx as object), user: 'pedro' });
  };
}

const GLOBAL = { steps: ['global'] };
const OWN = { steps: ['own'] };

/** A server rule of `rules/people`, the remote one by default. */
const spec = (over: Partial<RuleSpec> = {}): RuleSpec => ({
  id: 'rules/people',
  name: 'alias-taken',
  fails: [['alias-taken', []]],
  server: true,
  remote: true,
  async: true,
  ...over,
});

describe('the check of a rule the server runs', () => {
  // First of the file: no runner is installed yet.
  it('with levels and nothing to run them, it refuses: a declared auth must never be skipped', () => {
    const r = rule<string>(spec({ chain: [OWN] }));
    r.check(() => true);
    expect(() => run(r.use(), 'x', {})).toThrow('alias-taken of rules/people has middlewares and nothing runs them');
  });

  it('is given the ctx as its third argument; without levels it is called as it is', async () => {
    const r = rule<string, {}, never, { readonly id: number }>(spec({ remote: false, async: false }));
    const seen: unknown[] = [];
    r.check((value, _p, ctx) => {
      seen.push(ctx);
      return value !== 'admin';
    });
    expect(run(r.use(), 'admin', { id: 1 })).toEqual({ aliasTaken: true });
    expect(seen).toEqual([{ id: 1 }]);
  });

  it('on a submit only its own level runs around it: the function ran $global already', async () => {
    const levels: unknown[][] = [];
    runRulesWith(runner(levels));
    const r = rule<string, {}, never, { readonly user: string }>(spec({ chain: [GLOBAL, OWN] }));
    r.check((value, _p, ctx) => ctx.user === 'pedro' && value !== 'admin');
    expect(await run(r.use(), 'admin', {})).toEqual({ aliasTaken: true });
    expect(await run(r.use(), 'pedro', {})).toBeNull();
    expect(levels).toEqual([[OWN], [OWN]]);
  });

  it('in a form validated by the server, with the ctx of the request', async () => {
    const levels: unknown[][] = [];
    runRulesWith(runner(levels));
    const r = rule<string, {}, never, { readonly user: string }>(spec({ chain: [OWN] }));
    r.check((_value, _p, ctx) => ctx.user === 'nobody');
    const f = form({ alias: control('admin', [r.use()]) });
    expect(await f.$validate({ server: true, ctx: {} })).toBe(false);
    expect(f.alias.errors()).toEqual({ aliasTaken: true });
  });

});

describe('the registry of the remote rules', () => {
  it('holds the server variant of a remote rule, by `<id>` and name', () => {
    const r = rule<string>(spec());
    const remote = remoteRule('rules/people', 'alias-taken')!;
    expect(remote.spec.name).toBe('alias-taken');
    expect(remote.implemented()).toBe(false);
    expect(remote.missing()).toBe('alias-taken of rules/people has no implementation in src/server');
    r.check(() => true);
    expect(remote.implemented()).toBe(true);
  });

  it('never a runs server rule, nor the browser variant of a remote one', () => {
    rule<string>(spec({ id: 'rules/a', name: 'email-taken', remote: false }));
    rule<string>(spec({ id: 'rules/b', name: 'alias-taken', server: false }));
    expect(remoteRule('rules/a', 'email-taken')).toBeUndefined();
    expect(remoteRule('rules/b', 'alias-taken')).toBeUndefined();
    expect(remoteRule('rules/nobody', 'x')).toBeUndefined();
  });

  it('ask runs the whole chain and answers the code that failed, or null', async () => {
    const levels: unknown[][] = [];
    runRulesWith(runner(levels));
    const r = rule<string, {}, 'alias-taken' | 'alias-reserved', { readonly user: string }>(
      spec({ fails: [['alias-taken', []], ['alias-reserved', []]], chain: [GLOBAL, OWN] }),
    );
    r.check(async (value) => (value === 'root' ? 'alias-reserved' : value === 'admin' ? false : value === 'odd' ? ('weird' as never) : true));
    const remote = remoteRule('rules/people', 'alias-taken')!;
    expect(await remote.ask('admin', {}, {})).toBe('alias-taken');
    expect(await remote.ask('root', {}, {})).toBe('alias-reserved');
    // A code the declaration does not have fails as the first one.
    expect(await remote.ask('odd', {}, {})).toBe('alias-taken');
    expect(await remote.ask('pedro', {}, {})).toBeNull();
    expect(levels[0]).toEqual([GLOBAL, OWN]);
  });

  it('ask passes the parameters of the use, and a rule without chain is asked directly', async () => {
    const r = rule<string, { limit: number }>(spec({ name: 'too-long', fails: [['too-long', ['limit']]] }));
    r.check((value, p) => value.length <= p.limit);
    const remote = remoteRule('rules/people', 'too-long')!;
    expect(await remote.ask('abcdef', { limit: 3 }, {})).toBe('too-long');
    expect(await remote.ask('ab', { limit: 3 }, {})).toBeNull();
  });

  it('ask without an implementation fails saying what is missing', async () => {
    rule<string>(spec({ name: 'nobody' }));
    await expect(remoteRule('rules/people', 'nobody')!.ask('x', {}, {})).rejects.toThrow('nobody of rules/people has no implementation');
  });
});
