/**
 * SDD-82 §3.9: what the real server answers to a criterion that records — a `load` that ran, a
 * function or a remote rule whose handler ran — handed to the bench in the fixture's vocabulary.
 * What the fixture answered is not recorded: it is not the server's.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { remoteRule, rule } from '@fudic/forms/contract';
import { fn, page, type FnSpec } from '../../src/contract/index.js';
import { BENCH_KEY, runLoad, serve, type BenchHooks, type Recorded } from '../../src/contract/server.js';
import { recordedData, recordedFailure } from '../../src/contract/bench.js';
import { serveRule } from '../../src/contract/rule-route.js';
import { HttpError, Redirect } from '../../src/errors.js';
import { pageContext } from '../../src/server/load.js';
import { jsonWire } from '../../src/wire/json.js';

const CRITERION = 'run.graba';
const COOKIE = { cookie: `fudic-bench=${CRITERION}` };

/** Hooks that record, with `answers` answered by the fixture. */
function install(answers: Record<string, unknown> = {}, record = true): Recorded[] {
  const recorded: Recorded[] = [];
  const hooks: BenchHooks = {
    criterionOf: (r) => (r.headers.get('cookie') === COOKIE.cookie ? CRITERION : undefined),
    data: () => undefined,
    answer: (_c, name) => (Object.hasOwn(answers, name) ? { value: answers[name] } : undefined),
    called: () => undefined,
    services: () => [],
    now: () => undefined,
    after: () => Promise.resolve(),
    ...(record ? { record: (_c: string, entry: Recorded) => void recorded.push(entry) } : {}),
  };
  (globalThis as Record<symbol, unknown>)[BENCH_KEY] = hooks;
  return recorded;
}

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[BENCH_KEY];
});

/** What each recorded entry holds, its data awaited. */
const settled = (recorded: readonly Recorded[]) =>
  Promise.all(recorded.map(async (e) => (e.kind === 'data' ? { route: e.route, value: await e.value } : { name: e.name, value: e.value })));

describe('a load that records', () => {
  const ctx = (headers: Record<string, string> = COOKIE) =>
    pageContext({ url: new URL('https://app.test/usuarios'), params: {}, request: new Request('https://app.test/usuarios', { headers }) });
  const loadOf = (id: string, handler: () => unknown, later?: string[]) => {
    const load = page<(ctx: never) => unknown>({ id, name: 'load', ...(later !== undefined ? { later } : {}) });
    load.handle(handler as never);
    return load;
  };

  it('hands what it gave, its later fields settled; a failed one is later.fails', async () => {
    const recorded = install();
    const load = loadOf('routes/usuarios', () => ({
      users: ['ana'],
      total: Promise.resolve(2),
      lost: Promise.reject(new HttpError({ status: 503, title: 'caído' })),
      odd: Promise.reject(new Error('boom')),
    }), ['total', 'lost', 'odd']);
    const data = (await runLoad(load as never, ctx(), true)) as Record<string, Promise<unknown>>;
    expect(await data['total']).toEqual({ ok: 2 });
    expect(await settled(recorded)).toEqual([
      {
        route: 'routes/usuarios',
        value: {
          users: ['ana'],
          total: 2,
          lost: { $later: 0, fails: { status: 503, title: 'caído' } },
          odd: { $later: 0, fails: { status: 500, title: 'Internal Server Error' } },
        },
      },
    ]);
  });

  it('what it threw, as its marker; a request without the criterion records nothing', async () => {
    const recorded = install();
    const failing = loadOf('routes/caido', () => {
      throw new HttpError({ status: 503, title: 'caído' });
    });
    await expect(runLoad(failing as never, ctx(), true)).rejects.toMatchObject({ status: 503 });
    const plain = loadOf('routes/plain', () => 'hola');
    expect(await runLoad(plain as never, ctx({}), true)).toBe('hola');
    expect(await settled(recorded)).toEqual([{ route: 'routes/caido', value: { $fails: { status: 503, title: 'caído' } } }]);
  });

  it('a bench that does not record is never asked to', async () => {
    install({}, false);
    const plain = loadOf('routes/plain', () => ({ n: 1 }));
    expect(await runLoad(plain as never, ctx(), true)).toEqual({ n: 1 });
  });
});

describe('recordedFailure and recordedData', () => {
  it('a redirect, a code, a status, anything else', () => {
    expect(recordedFailure(new Redirect({ status: 303, title: 'See Other', location: '/entrar' }))).toEqual({ $redirects: '/entrar', status: 303 });
    expect(recordedFailure(new HttpError({ status: 409, title: 'Conflict', code: 'ana' }))).toEqual({ $fails: { code: 'ana' } });
    expect(recordedFailure(new HttpError({ status: 401, title: 'Unauthorized' }))).toEqual({ $fails: { status: 401, title: 'Unauthorized' } });
    expect(recordedFailure(new TypeError('x'))).toEqual({ $fails: { status: 500, title: 'Internal Server Error' } });
  });

  it('data that is not an object, or without later fields, as it is', async () => {
    expect(await recordedData(Promise.resolve(null), ['x'])).toBeNull();
    expect(await recordedData(Promise.resolve({ a: 1 }), [])).toEqual({ a: 1 });
  });
});

describe('a function that records', () => {
  const contract = (name: string, handler: (ctx: any) => unknown, over: Partial<FnSpec> = {}) => {
    const c = fn({ id: 'routes/usuarios', name, method: 'PUT', chain: [], wire: jsonWire, ...over });
    c.handle(handler as never);
    return c;
  };
  const call = (c: ReturnType<typeof contract>, body: unknown = {}) =>
    serve(
      {
        request: new Request(`https://app.test/_fudic/fn/routes/usuarios/${c.spec.name}`, {
          method: 'PUT',
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json', ...COOKIE },
        }),
        contract: c,
        page: {},
        route: {},
      },
      { dev: true },
    );

  it('hands what its handler answered or failed with; what the fixture answered, never', async () => {
    const recorded = install({ search: ['luis'] });
    await call(contract('search', () => ['real'], { returns: { list: 'str' } }));
    await call(contract('login', () => undefined));
    await call(contract('save', () => {
      throw new HttpError({ status: 409, title: 'Conflict', code: 'ana' });
    }));
    expect(await settled(recorded)).toEqual([
      { name: 'login', value: undefined },
      { name: 'save', value: { $fails: { code: 'ana' } } },
    ]);
  });

  it('a bench that does not record is never asked to', async () => {
    install({}, false);
    expect(await (await call(contract('save', () => 'ok', { returns: 'str' }))).json()).toBe('ok');
    expect((await call(contract('fail', () => {
      throw new HttpError({ status: 400, title: 'Bad Request' });
    }))).status).toBe(400);
  });
});

describe('a remote rule that records', () => {
  const remote = (name: string, check: (v: string) => boolean | Promise<boolean>) => {
    const r = rule<string, any, never, never>({ id: 'rules/graba', name, fails: [[name, []]], server: true, remote: true, async: true, value: 'str', params: {}, wire: jsonWire } as never);
    r.check(check as never);
    return remoteRule('rules/graba', name)!;
  };
  const ask = (name: string, value: string) =>
    serveRule(
      new Request(`https://app.test/_fudic/rule/rules/graba/${name}`, {
        method: 'POST',
        body: JSON.stringify({ value, params: {} }),
        headers: { 'content-type': 'application/json', ...COOKIE },
      }),
      remote(name, name === 'down' ? () => Promise.reject(new HttpError({ status: 503, title: 'caído' })) : (v) => v !== 'admin') as never,
      { dev: true },
    );

  it('a pass is undefined, a failed code its fails(code), a throw its marker', async () => {
    const recorded = install();
    await ask('alias', 'ana');
    await ask('taken', 'admin');
    expect((await ask('down', 'x')).status).toBe(503);
    expect(await settled(recorded)).toEqual([
      { name: 'alias', value: undefined },
      { name: 'taken', value: { $fails: { code: 'taken' } } },
      { name: 'down', value: { $fails: { status: 503, title: 'caído' } } },
    ]);
  });

  it('a bench that does not record is never asked to', async () => {
    install({}, false);
    expect(await (await ask('quiet', 'ana')).json()).toEqual({ ok: true });
    expect((await ask('down', 'x')).status).toBe(503);
  });
});
