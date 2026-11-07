/**
 * SDD-80 §4.3 and criteria 11–16, end to end: the browser half of a `runs remote` rule asking
 * the route of `@fudic/http` in memory — the real formats, the real signature check, the real
 * chain — as the two generated variants of one declaration would.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askRemote, control, form, rule, type RuleSpec } from '@fudic/forms/contract';
import { contractsHandler } from '../../src/contract/server.js';
import { binWire } from '../../src/wire/bin.js';
import { jsonWire } from '../../src/wire/json.js';

const handle = contractsHandler();

/** The two variants of `alias-taken` of `rules/<id>`, as the generated modules write them. */
function declare(id: string, over: Partial<RuleSpec> = {}, check: (value: string) => boolean | Promise<boolean> = (v) => v !== 'admin') {
  const shared = {
    id,
    name: 'alias-taken',
    fails: [['alias-taken', []]] as const,
    remote: true,
    async: true,
    value: 'str',
    params: {},
    wire: binWire,
    sig: 'feedc0de',
    ...over,
  } satisfies RuleSpec;
  rule<string>({ ...shared, server: true, chain: [{ steps: [] }] }).check(check);
  return rule<string>({ ...shared, debounce: 300, ask: askRemote });
}

/** `fetch`, answered by the route in memory; every question it saw. */
function serve() {
  const asked: Request[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, init: RequestInit) => {
      const request = new Request(url, init);
      asked.push(request.clone());
      return (await handle(request))!;
    }),
  );
  return asked;
}

const wait = (ms: number): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => undefined);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('location', { origin: 'https://app.test' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the question, asked of the route (criteria 11, 13)', () => {
  it('in fud-bin: a taken alias is painted, a free one passes, and going back asks nothing', async () => {
    const asked = serve();
    const f = form({ alias: control('', [declare('rules/bin').use()]) });
    for (const value of ['a', 'ad', 'adm']) {
      f.alias.set(value);
      void f.alias.validate();
      await wait(100);
    }
    f.alias.set('admin');
    const taken = f.alias.validate();
    await wait(300);
    expect(await taken).toBe(false);
    expect(f.alias.errors()).toEqual({ aliasTaken: true });
    expect(asked).toHaveLength(1);
    expect(asked[0]!.headers.get('content-type')).toBe(binWire.type);

    f.alias.set('pedro');
    const free = f.alias.validate();
    await wait(300);
    expect(await free).toBe(true);

    f.alias.set('admin');
    void f.alias.validate();
    expect(f.alias.errors()).toEqual({ aliasTaken: true });
    expect(asked).toHaveLength(2);
  });

  it('with use json', async () => {
    const asked = serve();
    const r = rule<string>({ id: 'rules/json', name: 'alias-taken', fails: [['alias-taken', []]], remote: true, async: true, value: 'str', params: {}, wire: jsonWire, server: true, chain: [{ steps: [] }] });
    r.check((v) => v !== 'admin');
    const browser = rule<string>({ id: 'rules/json', name: 'alias-taken', fails: [['alias-taken', []]], remote: true, async: true, value: 'str', params: {}, wire: jsonWire, debounce: 0, ask: askRemote });
    const f = form({ alias: control('', [browser.use()]) });
    f.alias.set('admin');
    const taken = f.alias.validate();
    await wait(0);
    expect(await taken).toBe(false);
    expect(f.alias.errors()).toEqual({ aliasTaken: true });
    expect(asked[0]!.headers.get('content-type')).toBe('application/json');
  });
});

describe('what the route refuses passes as valid (criterion 14)', () => {
  it('a check that throws is a 500: no error, not pending, and the next time it asks again', async () => {
    const asked = serve();
    const f = form({
      alias: control('', [
        declare('rules/boom', {}, () => {
          throw new Error('the database is down');
        }).use(),
      ]),
    });
    f.alias.set('admin');
    const done = f.alias.validate();
    await wait(300);
    expect(await done).toBe(true);
    expect(f.alias.errors()).toBeNull();
    expect(f.alias.pending()).toBe(false);
    expect(f.$valid()).toBe(true);
    f.alias.set('x');
    await Promise.all([f.alias.validate(), wait(300)]);
    f.alias.set('admin');
    await Promise.all([f.alias.validate(), wait(300)]);
    expect(asked).toHaveLength(3);
  });

  it('a page of another version (412) passes too', async () => {
    serve();
    // The server knows the rule with one signature, the page with another.
    rule<string>({ id: 'rules/stale', name: 'alias-taken', fails: [['alias-taken', []]], remote: true, async: true, value: 'str', params: {}, wire: binWire, sig: 'aaaaaaaa', server: true, chain: [{ steps: [] }] }).check(() => false);
    const page = rule<string>({ id: 'rules/stale', name: 'alias-taken', fails: [['alias-taken', []]], remote: true, async: true, value: 'str', params: {}, wire: binWire, sig: 'bbbbbbbb', debounce: 0, ask: askRemote });
    const f = form({ alias: control('', [page.use()]) });
    f.alias.set('admin');
    const done = f.alias.validate();
    await wait(0);
    expect(await done).toBe(true);
  });
});

describe('pending and the submit (criteria 15, 16)', () => {
  it('pending from the keystroke to the answer; the submit asks nothing', async () => {
    const asked = serve();
    const f = form({ alias: control('', [declare('rules/pending').use()]) });
    f.alias.set('pedro');
    const done = f.alias.validate();
    expect(f.alias.pending()).toBe(true);
    expect(f.$pending()).toBe(true);
    expect(f.$valid()).toBe(false);
    await wait(300);
    expect(await done).toBe(true);
    expect(f.alias.pending()).toBe(false);
    expect(f.$valid()).toBe(true);

    f.alias.set('admin');
    expect(await f.$validate()).toBe(true);
    await wait(300);
    expect(asked).toHaveLength(1);
  });
});
