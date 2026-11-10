/**
 * SDD-82 §3.8, §4.2, §4.4: a request of a criterion of the workbench, answered by its hooks —
 * what `load` returns, what a function or a remote rule answers, the services of its root — and
 * every call logged, answered or not. Criteria 10–15 and 23 in the model: the hooks as an object
 * on `globalThis`, the server as `serve`, `serveRule` and `runLoad`.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, inject, injectFrom, token } from '@fudic/di';
import { remoteRule, rule } from '@fudic/forms/contract';
import { fn, page, type FnSpec } from '../../src/contract/index.js';
import { BENCH_KEY, benchHooks, benchRoot, runLoad, serve, settleLater, type BenchCall, type BenchHooks } from '../../src/contract/server.js';
import { benchOf, failedError, settleAnswer, settleData, settleVerdict } from '../../src/contract/bench.js';
import { serveRule } from '../../src/contract/rule-route.js';
import { HttpError, Redirect } from '../../src/errors.js';
import { pageContext } from '../../src/server/load.js';
import { jsonWire } from '../../src/wire/json.js';

const CRITERION = 'run.uno';
const Clock = token<string>('clock');

/** Hooks over plain tables, logging every call. */
function install(over: {
  data?: Record<string, unknown[]>;
  answers?: Record<string, unknown>;
  services?: BenchHooks['services'];
  after?: BenchHooks['after'];
} = {}): BenchCall[] {
  const calls: BenchCall[] = [];
  const asked = new Map<string, number>();
  const hooks: BenchHooks = {
    criterionOf: (r) => (r.headers.get('cookie') === `fudic-bench=${CRITERION}` ? CRITERION : undefined),
    data: (_c, route) => {
      const list = over.data?.[route];
      if (list === undefined) return undefined;
      const n = asked.get(route) ?? 0;
      asked.set(route, n + 1);
      return { value: list[Math.min(n, list.length - 1)] };
    },
    answer: (_c, name) => (over.answers !== undefined && Object.hasOwn(over.answers, name) ? { value: over.answers[name] } : undefined),
    called: (_c, call) => void calls.push(call),
    services: over.services ?? (() => []),
    now: () => undefined,
    after: over.after ?? (() => Promise.resolve()),
  };
  (globalThis as Record<symbol, unknown>)[BENCH_KEY] = hooks;
  return calls;
}

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[BENCH_KEY];
});

const COOKIE = { cookie: `fudic-bench=${CRITERION}` };

/** `name` of `routes/usuarios` in JSON, implemented by `handler` unless it is `null`. */
function contract(name: string, handler: ((ctx: any) => unknown) | null, over: Partial<FnSpec> = {}) {
  const c = fn({ id: 'routes/usuarios', name, method: 'PUT', chain: [], wire: jsonWire, ...over });
  if (handler !== null) c.handle(handler as never);
  return c;
}

const call = (c: ReturnType<typeof contract>, body: unknown = {}, headers: Record<string, string> = COOKIE, dev = true, signal?: AbortSignal) =>
  serve(
    {
      request: new Request(`https://app.test/_fudic/fn/routes/usuarios/${c.spec.name}`, {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json', ...headers },
        ...(signal !== undefined ? { signal } : {}),
      }),
      contract: c,
      page: {},
      route: {},
    },
    { dev },
  );

describe('the hooks', () => {
  it('are read off globalThis, only in dev and only for a request with a criterion', () => {
    expect(benchHooks()).toBeUndefined();
    expect(benchOf(new Request('https://a/', { headers: COOKIE }), true)).toBeUndefined();
    install();
    expect(benchHooks()).toBeDefined();
    expect(benchOf(new Request('https://a/', { headers: COOKIE }), true)?.criterion).toBe(CRITERION);
    expect(benchOf(new Request('https://a/', { headers: COOKIE }), false)).toBeUndefined();
    expect(benchOf(new Request('https://a/'), true)).toBeUndefined();
    expect(benchOf(undefined, true)).toBeUndefined();
  });

  it('put the criterion services in a root', () => {
    install({ services: () => [{ provide: Clock, use: () => 'falso' }] });
    expect(injectFrom(benchRoot(createRoot(), new Request('https://a/', { headers: COOKIE })), Clock)).toBe('falso');
    expect(() => injectFrom(benchRoot(createRoot(), new Request('https://a/')), Clock)).toThrow();
  });
});

describe('a function of a criterion (criteria 13, 23)', () => {
  it('criterion 13: the fixture answers without the handler; one it does not name runs; both are logged', async () => {
    const calls = install({ answers: { search: ['luis'] } });
    let ran = 0;
    const search = contract('search', () => ++ran && ['real'], { args: { q: 'str' }, returns: { list: 'str' } });
    const save = contract('save', () => ++ran && 'ok', { returns: 'str' });
    const faked = await call(search, { q: 'lu' });
    expect(await faked.json()).toEqual(['luis']);
    const real = await call(save);
    expect(await real.json()).toBe('ok');
    expect(ran).toBe(1);
    expect(calls).toEqual([
      { id: 'routes/usuarios', name: 'search', args: { q: 'lu' }, faked: true, status: 200 },
      { id: 'routes/usuarios', name: 'save', args: {}, faked: false, status: 200 },
    ]);
  });

  it('a request without the criterion, or outside dev, is not the bench’s', async () => {
    const calls = install({ answers: { search: ['luis'] } });
    const search = contract('search', () => ['real'], { returns: { list: 'str' } });
    expect(await (await call(search, {}, {})).json()).toEqual(['real']);
    expect(await (await call(search, {}, COOKIE, false)).json()).toEqual(['real']);
    expect(calls).toEqual([]);
  });

  it('answers a function nobody implemented; without an answer it is the 404 of dev', async () => {
    install({ answers: { ghost: 'boo' } });
    expect(await (await call(contract('ghost', null, { returns: 'str' }))).json()).toBe('boo');
    const missing = await call(contract('nobody', null, { returns: 'str' }));
    expect(missing.status).toBe(404);
    // Outside the bench, the 404 comes before anything is read.
    delete (globalThis as Record<symbol, unknown>)[BENCH_KEY];
    expect((await call(contract('nobody2', null, { returns: 'str' }), {}, {})).status).toBe(404);
  });

  it('fails by status, by a declared code and by an undeclared one; a redirect keeps its 3xx', async () => {
    const calls = install({
      answers: { a: { $fails: { status: 401, title: 'sin sesión' } }, b: { $fails: { code: 'ana' } }, c: { $fails: { code: 'otro' } }, d: { $redirects: '/entrar', status: 303 } },
    });
    const a = await call(contract('a', () => 1));
    expect(a.status).toBe(401);
    expect(await a.json()).toMatchObject({ status: 401, title: 'sin sesión' });
    const b = await call(contract('b', () => 1, { codes: { ana: [409, 'Ana no.'] } }));
    expect(b.status).toBe(409);
    expect(b.headers.get('fud-code')).toBe('ana');
    expect(await b.json()).toMatchObject({ detail: 'Ana no.' });
    const bare = await call(contract('b', () => 1, { codes: { ana: [409] } }));
    expect(await bare.json()).toEqual({ status: 409, title: 'Conflict' });
    const c = await call(contract('c', () => 1));
    expect(c.status).toBe(500);
    expect((await c.json()).detail).toContain('"otro"');
    const d = await call(contract('d', () => 1));
    expect(d.status).toBe(303);
    expect(await d.json()).toMatchObject({ location: '/entrar' });
    expect(calls.map((x) => [x.name, x.faked, x.status])).toEqual([
      ['a', true, 401],
      ['b', true, 409],
      ['b', true, 409],
      ['c', true, 500],
      ['d', true, 303],
    ]);
  });

  it('criterion 23: fails(0) is a network failure — no response at all', async () => {
    const calls = install({ answers: { save: { $fails: { status: 0, title: 'network' } } } });
    const out = await call(contract('save', () => 1));
    expect(out.type).toBe('error');
    expect(calls[0]).toMatchObject({ faked: true, status: 0 });
  });

  it('a later waits on the criterion clock; later.fails fails after it', async () => {
    const waited: number[] = [];
    install({
      answers: { slow: { $later: 2000, value: 'tarde' }, bad: { $later: 10, fails: { status: 503, title: 'caído' } } },
      after: (_c, ms) => {
        waited.push(ms);
        return Promise.resolve();
      },
    });
    expect(await (await call(contract('slow', () => 'x', { returns: 'str' }))).json()).toBe('tarde');
    expect((await call(contract('bad', () => 'x', { returns: 'str' }))).status).toBe(503);
    expect(waited).toEqual([2000, 10]);
  });

  it('criterion 14: later.never() never answers, until the browser gives up', async () => {
    install({ answers: { never: { $later: 'never' } } });
    const abort = new AbortController();
    const pending = call(contract('never', () => 'x', { returns: 'str' }), {}, COOKIE, true, abort.signal);
    let settled = false;
    void pending.then(() => (settled = true));
    await new Promise((r) => setTimeout(r, 20));
    expect(settled).toBe(false);
    abort.abort(new Error('gone'));
    expect((await pending).status).toBe(500);
  });

  it('a file answers a -> file function; a file to one without it, or a value to one with it, is a mismatch', async () => {
    const calls = install({ answers: { csv: new File(['a,b'], 'personas.csv', { type: 'text/csv' }), csvMal: 'texto', save: new File(['x'], 'x.txt') } });
    const csv = await call(contract('csv', () => 1, { returns: 'file' }));
    expect(csv.headers.get('content-type')).toBe('text/csv');
    expect(await csv.text()).toBe('a,b');
    const opt = await call(contract('csv', () => 1, { returns: { opt: 'file' } }));
    expect(opt.status).toBe(200);
    const wrong = await call(contract('csvMal', () => 1, { returns: 'file' }));
    expect(wrong.status).toBe(500);
    expect((await wrong.json()).detail).toBe('the fixture answers a function with -> file without a file');
    const save = await call(contract('save', () => 1, { returns: { list: 'str' } }));
    expect((await save.json()).detail).toBe('the fixture answers a file to a function without -> file');
    expect(calls.map((x) => x.mismatch === true)).toEqual([false, false, true, true]);
  });

  it('a call that runs for real resolves the criterion services', async () => {
    install({ services: () => [{ provide: Clock, use: () => 'del criterio' }] });
    const clock = contract('clock', () => inject(Clock), { returns: 'str' });
    expect(await (await call(clock)).json()).toBe('del criterio');
  });
});

describe('a remote rule of a criterion (criterion 15)', () => {
  const remote = (name: string, check: ((v: string) => boolean) | null) => {
    const r = rule<string, any, never, never>({ id: 'rules/people', name, fails: [[name, []]], server: true, remote: true, async: true, value: 'str', params: {}, wire: jsonWire } as never);
    if (check !== null) r.check(check as never);
    return r;
  };
  const ask = (name: string, value: string, headers: Record<string, string> = COOKIE) =>
    serveRule(
      new Request(`https://app.test/_fudic/rule/rules/people/${name}`, {
        method: 'POST',
        body: JSON.stringify({ value, params: {} }),
        headers: { 'content-type': 'application/json', ...headers },
      }),
      { spec: (remote(name, null), remoteRule('rules/people', name)!.spec), implemented: () => false, missing: () => `${name} has no implementation`, ask: () => Promise.resolve(null) } as never,
      { dev: true },
    );

  it('answers the verdict of the fixture, without the check', async () => {
    const calls = install({ answers: { 'alias-taken': { $fails: { code: 'alias-taken' } }, free: null, down: { $fails: { status: 503, title: 'caído' } }, cut: { $fails: { status: 0, title: 'network' } } } });
    expect(await (await ask('alias-taken', 'admin')).json()).toEqual({ ok: false, fails: 'alias-taken' });
    expect(await (await ask('free', 'x')).json()).toEqual({ ok: true });
    expect((await ask('down', 'x')).status).toBe(503);
    expect((await ask('cut', 'x')).type).toBe('error');
    expect(calls.map((x) => [x.name, x.args, x.faked])).toEqual([
      ['alias-taken', { value: 'admin', params: {} }, true],
      ['free', { value: 'x', params: {} }, true],
      ['down', { value: 'x', params: {} }, true],
      ['cut', { value: 'x', params: {} }, true],
    ]);
  });

  it('one the fixture does not name runs for real, logged; unimplemented, it is a 404', async () => {
    const calls = install({ services: () => [{ provide: Clock, use: () => 'c' }] });
    const r = remote('real', (v) => v !== 'admin');
    const asked = await serveRule(
      new Request('https://app.test/_fudic/rule/rules/people/real', { method: 'POST', body: JSON.stringify({ value: 'admin', params: {} }), headers: { 'content-type': 'application/json', ...COOKIE } }),
      remoteRule('rules/people', 'real') as never,
      { dev: true },
    );
    expect(await asked.json()).toEqual({ ok: false, fails: 'real' });
    expect((await ask('nadie', 'x')).status).toBe(404);
    expect(calls.map((x) => [x.name, x.faked, x.status])).toEqual([
      ['real', false, 200],
      ['nadie', false, 404],
    ]);
  });
});

describe('load of a criterion (criteria 10–12, 14)', () => {
  const load = page<(ctx: never) => unknown>({ id: 'routes/usuarios', name: 'load', later: ['total'] });
  load.handle((() => ({ users: ['real'], total: Promise.resolve(9) })) as never);
  const plain = page<(ctx: never) => unknown>({ id: 'routes/plain', name: 'load' });
  plain.handle((() => ({ users: ['real'] })) as never);
  const ctx = (headers: Record<string, string> = COOKIE) =>
    pageContext({ url: new URL('https://app.test/usuarios'), params: {}, request: new Request('https://app.test/usuarios', { headers }) });

  it('criterion 10: the fixture data in place of load; without it, load runs', async () => {
    install({ data: { 'routes/plain': [{ users: ['ana', 'luis'] }] } });
    expect(await runLoad(plain as never, ctx(), true)).toEqual({ users: ['ana', 'luis'] });
    expect(await runLoad(plain as never, ctx({}), true)).toEqual({ users: ['real'] });
    expect(await runLoad(plain as never, ctx(), false)).toEqual({ users: ['real'] });
  });

  it('criterion 11: each data request takes the next; the last repeats', async () => {
    install({ data: { 'routes/plain': [{ n: 1 }, { n: 2 }] } });
    const seen = [];
    for (let i = 0; i < 3; i++) seen.push(await runLoad(plain as never, ctx(), true));
    expect(seen).toEqual([{ n: 1 }, { n: 2 }, { n: 2 }]);
  });

  it('criterion 12: a failure throws its HttpError, a redirect its Redirect', async () => {
    install({ data: { 'routes/plain': [{ $fails: { status: 503, title: 'la base de datos no responde' } }] } });
    await expect(runLoad(plain as never, ctx(), true)).rejects.toMatchObject({ status: 503 });
    install({ data: { 'routes/plain': [{ $redirects: '/entrar', status: 303 }] } });
    const thrown = await runLoad(plain as never, ctx(), true).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(Redirect);
    expect((thrown as Redirect).location).toBe('/entrar');
  });

  it('criterion 14: a later field arrives on the clock, later.never() never; a plain one too', async () => {
    install({ data: { 'routes/usuarios': [{ users: [], total: { $later: 5, value: 2 } }] } });
    const data = (await runLoad(load as never, ctx(), true)) as Record<string, Promise<unknown>>;
    expect(await data['total']).toEqual({ ok: 2 });
    install({ data: { 'routes/usuarios': [{ users: [], total: 7 }] } });
    expect(await ((await runLoad(load as never, ctx(), true)) as Record<string, Promise<unknown>>)['total']).toEqual({ ok: 7 });
  });
});

describe('the markers', () => {
  const bench = { hooks: { after: () => Promise.resolve() } as unknown as BenchHooks, criterion: 'c' };

  it('a plain value is itself; a failure, its error', async () => {
    expect(await settleAnswer(bench, 3)).toBe(3);
    expect(await settleAnswer(bench, { a: 1 })).toEqual({ a: 1 });
    expect(failedError({ status: 418, title: 'tetera' })).toBeInstanceOf(HttpError);
    expect(failedError({ code: 'x' }).status).toBe(500);
  });

  it('settleData leaves data that is not an object as it is', async () => {
    expect(await settleData(bench, null, ['x'])).toBeNull();
    expect(await settleData(bench, { x: 1 }, [])).toEqual({ x: 1 });
  });

  it('settleVerdict: a later verdict; a redirect throws', async () => {
    expect(await settleVerdict(bench, { $later: 1, value: { $fails: { code: 'k' } } })).toBe('k');
    expect(await settleVerdict(bench, { ok: true })).toBeNull();
    await expect(settleVerdict(bench, { $redirects: '/x', status: 303 })).rejects.toBeInstanceOf(Redirect);
  });

  it('settleLater still settles what the fixture data holds', async () => {
    const out = settleLater({ a: Promise.reject(new HttpError({ status: 404, title: 'Not Found' })) }, ['a'], true);
    expect(await out['a']).toMatchObject({ error: { status: 404 } });
  });
});
