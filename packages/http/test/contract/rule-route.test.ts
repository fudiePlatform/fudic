/**
 * SDD-80 §3.3, §4.4 and criteria 6–10: the question of a `runs remote` rule,
 * `POST /_fudic/rule/<id>/<name>`, and a rule the server runs inside the submit of a form.
 *
 * Every request is a real `Request` and every answer is read back from the `Response`.
 */

import { describe, expect, it, vi } from 'vitest';
import { createRoot } from '@fudic/di';
import { form, remoteRule, rule, str, type Check, type RuleSpec } from '@fudic/forms/contract';
import { fn, middleware, use, type FnSpec, type Level } from '../../src/contract/index.js';
import { contractsHandler, serve } from '../../src/contract/server.js';
import { serveRule } from '../../src/contract/rule-route.js';
import { unauthorized } from '../../src/errors.js';
import type { ServerContext } from '../../src/types.js';
import { binWire } from '../../src/wire/bin.js';
import { jsonWire } from '../../src/wire/json.js';
import { formTypes } from '../../src/wire/schema.js';
import type { Ty } from '../../src/wire/ty.js';
import { binBody, binProblem, bytesOf } from '../helpers.js';

// Each test declares its rule afresh, with a slot of its own: the registry is never emptied, so
// the middlewares implemented once below stay implemented.

const SIG = 'a1b2c3d4';
const URL_ALIAS = 'https://app.test/_fudic/rule/rules/people/alias-taken';
const QUESTION: Readonly<Record<string, Ty>> = { value: 'str', params: { fields: () => ({}) } };
const VERDICT: Ty = { opt: 'str' };

/** `auth`: lets a request with a `session` cookie through, leaving its `user`; 401 otherwise. */
const auth = middleware<{}, { user: string }>({ id: 'middlewares/own', name: 'auth', server: true });
auth.server((ctx, next) => {
  const user = ctx.cookies.get('session');
  if (user === undefined) throw unauthorized('no session');
  return next({ ...ctx, user });
});
const level = (...uses: ReturnType<typeof use>[]): Level => ({ steps: uses.length === 0 ? [] : [{ use: uses }] });

type Ctx = ServerContext & { readonly user?: string };

/**
 * `alias-taken` of `rules/people`, remote, implemented with `check`: `admin` is taken. In
 * `fud-bin` it is signed; with `use json` it has no signature, as the generated module writes it.
 */
function aliasTaken(over: Partial<RuleSpec> = {}, check: ((value: string, params: any, ctx: Ctx) => unknown) | null = (v) => v !== 'admin') {
  const r = rule<string, any, never, Ctx>({
    id: 'rules/people',
    name: 'alias-taken',
    fails: [['alias-taken', []]],
    server: true,
    remote: true,
    async: true,
    value: 'str',
    params: {},
    chain: [level()],
    ...(over.wire === jsonWire ? {} : { wire: binWire, sig: SIG }),
    ...over,
  });
  if (check !== null) r.check(check as never);
  return r;
}

/** A question in `fud-bin`, signed. */
function askBin(value: unknown, init: { sig?: string | null; cookie?: string; types?: Readonly<Record<string, Ty>>; url?: string } = {}): Request {
  const { headers, body } = binBody(init.types ?? QUESTION, { value, params: {} });
  const sig = init.sig === undefined ? SIG : init.sig;
  return new Request(init.url ?? URL_ALIAS, {
    method: 'POST',
    body,
    headers: { ...headers, ...(sig !== null ? { 'fud-sig': sig } : {}), ...(init.cookie !== undefined ? { cookie: init.cookie } : {}) },
  });
}

/** A question in JSON. */
const askJson = (body: unknown, headers: Record<string, string> = {}): Request =>
  new Request(URL_ALIAS, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });

const verdict = async (res: Response): Promise<unknown> => binWire.decodeValue(VERDICT, await bytesOf(res));

const handle = contractsHandler();

describe('the question in fud-bin (criterion 6)', () => {
  it('a taken alias answers 200 with its code; a free one, null', async () => {
    aliasTaken();
    const taken = await handle(askBin('admin'));
    expect(taken!.status).toBe(200);
    expect(taken!.headers.get('content-type')).toBe(binWire.type);
    expect(await verdict(taken!)).toBe('alias-taken');
    const free = await handle(askBin('pedro'));
    expect(free!.status).toBe(200);
    // `null` on the wire: an absent optional reads back absent.
    const bytes = await bytesOf(free!);
    expect(bytes).toEqual(binWire.encodeValue(VERDICT, null));
    expect(binWire.decodeValue(VERDICT, bytes)).toBeUndefined();
  });

  it('the parameters of the use reach the check', async () => {
    aliasTaken({ name: 'too-long', fails: [['too-long', ['limit']]], params: { limit: 'u8' }, sig: SIG }, (v, p) => v.length <= p.limit);
    const types = { value: 'str', params: { fields: () => ({ limit: 'u8' }) } } satisfies Record<string, Ty>;
    const ask = (value: string) => {
      const { headers, body } = binBody(types, { value, params: { limit: 3 } });
      return new Request('https://app.test/_fudic/rule/rules/people/too-long', { method: 'POST', body, headers: { ...headers, 'fud-sig': SIG } });
    };
    expect(await verdict((await handle(ask('abcdef')))!)).toBe('too-long');
    expect(await verdict((await handle(ask('ab')))!)).toBeUndefined();
  });
});

describe('the question with use json (criterion 6)', () => {
  it('answers { ok: false, fails } or { ok: true }, with no signature', async () => {
    aliasTaken({ wire: jsonWire });
    const taken = await handle(askJson({ value: 'admin', params: {} }));
    expect(taken!.status).toBe(200);
    expect(taken!.headers.get('content-type')).toBe('application/json');
    expect(await taken!.json()).toEqual({ ok: false, fails: 'alias-taken' });
    expect(await (await handle(askJson({ value: 'pedro', params: {} })))!.json()).toEqual({ ok: true });
  });
});

describe('what is refused (criterion 7)', () => {
  it('a runs server rule has no route: 404, as a function that does not exist', async () => {
    rule<string>({ id: 'rules/people', name: 'email-taken', fails: [['email-taken', []]], server: true }).check(() => true);
    const res = await handle(askBin('a@b.es', { url: 'https://app.test/_fudic/rule/rules/people/email-taken' }));
    expect(res!.status).toBe(404);
    expect((await binProblem(res!)).detail).toBe('no such remote rule');
    // One that asks in JSON is answered in JSON.
    const json = await handle(new Request('https://app.test/_fudic/rule/rules/nobody/x', { method: 'POST', headers: { accept: 'application/json' } }));
    expect(json!.headers.get('content-type')).toBe('application/problem+json');
  });

  it('a value of another type is 400', async () => {
    aliasTaken({ wire: jsonWire });
    const res = await handle(askJson({ value: 5, params: {} }));
    expect(res!.status).toBe(400);
    expect(res!.headers.get('content-type')).toBe('application/problem+json');
    expect(((await res!.json()) as { detail: string }).detail).toMatch(/value/u);
    // No body at all: the value is missing.
    const empty = await handle(new Request(URL_ALIAS, { method: 'POST', headers: { 'content-type': 'application/json' } }));
    expect(empty!.status).toBe(400);
  });

  it('parameters of another type are 400 too', async () => {
    aliasTaken({ wire: jsonWire, params: { limit: 'u8' } });
    const res = await handle(askJson({ value: 'a', params: { limit: 'many' } }));
    expect(res!.status).toBe(400);
  });

  it('the signature of another version is 412, as is a missing one', async () => {
    aliasTaken();
    expect((await handle(askBin('admin', { sig: 'ffffffff' })))!.status).toBe(412);
    expect((await handle(askBin('admin', { sig: null })))!.status).toBe(412);
  });

  it('another method than POST is 405', async () => {
    aliasTaken();
    expect((await handle(new Request(URL_ALIAS, { method: 'GET' })))!.status).toBe(405);
  });

  it('a rule nobody implemented is 404, saying what is missing only in dev', async () => {
    aliasTaken({}, null);
    const built = await handle(askBin('admin'));
    expect(built!.status).toBe(404);
    expect((await binProblem(built!)).detail).toBeUndefined();
    const dev = await contractsHandler({ dev: true })(askBin('admin'));
    expect((await binProblem(dev!)).detail).toBe('alias-taken of rules/people has no implementation in src/server');
  });

  it('a check that throws is a 500, told to onError, with its message only in dev', async () => {
    aliasTaken({}, () => {
      throw new Error('the table is gone');
    });
    const onError = vi.fn();
    const res = await contractsHandler({ dev: true, onError })(askBin('admin'));
    expect(res!.status).toBe(500);
    expect((await binProblem(res!)).detail).toBe('the table is gone');
    expect(onError).toHaveBeenCalledOnce();
  });

  it('a URL outside the two prefixes is not ours; the base is honoured', async () => {
    aliasTaken();
    expect(await handle(new Request('https://app.test/about'))).toBeNull();
    const based = contractsHandler({ base: '/app/' });
    expect(await based(askBin('admin'))).toBeNull();
    const res = await based(askBin('admin', { url: 'https://app.test/app/_fudic/rule/rules/people/alias-taken' }));
    expect(await verdict(res!)).toBe('alias-taken');
  });
});

describe('the middlewares of the rule (criteria 8, 9)', () => {
  it('criterion 8: with use auth and no session, 401 in the rule format, and the check is not called', async () => {
    const check = vi.fn(() => true);
    aliasTaken({ chain: [level(use(auth))] }, check);
    const res = await handle(askBin('admin'));
    expect(res!.status).toBe(401);
    expect(res!.headers.get('content-type')).toBe(binWire.problemType);
    expect(await binProblem(res!)).toMatchObject({ status: 401, detail: 'no session' });
    expect(check).not.toHaveBeenCalled();
  });

  it('criterion 8, with use json: the 401 is application/problem+json', async () => {
    aliasTaken({ wire: jsonWire, chain: [level(use(auth))] });
    const res = await handle(askJson({ value: 'admin', params: {} }));
    expect(res!.status).toBe(401);
    expect(res!.headers.get('content-type')).toBe('application/problem+json');
  });

  it('criterion 9: after use auth the check reads ctx.user; $global runs before its own level', async () => {
    const trace: string[] = [];
    const global = middleware({ id: 'middlewares/own', name: 'trace', server: true });
    global.server((ctx, next) => {
      trace.push('global');
      return next(ctx);
    });
    aliasTaken({ chain: [level(use(global)), level(use(auth))] }, (value, _p, ctx) => {
      trace.push(`check ${ctx.user!}`);
      return value !== ctx.user;
    });
    const res = await handle(askBin('pedro', { cookie: 'session=pedro' }));
    expect(await verdict(res!)).toBe('alias-taken');
    expect(trace).toEqual(['global', 'check pedro']);
    // The verdict of a request that read the session is nobody else's: not cached.
    expect(res!.headers.get('cache-control')).toBe('private, no-store');
  });

  it('serveRule answers a rule handed to it directly, in a container of its own', async () => {
    aliasTaken();
    const res = await serveRule(askBin('admin'), remoteRule('rules/people', 'alias-taken')!, { container: createRoot });
    expect(await verdict(res)).toBe('alias-taken');
  });
});

describe('a rule the server runs, in the submit of a form (criterion 10)', () => {
  /** `save` of `routes/usuarios`, with a form whose alias runs `alias-taken`. */
  function save(handler: (ctx: any) => unknown, chain: readonly Level[] = []) {
    const r = aliasTaken({ chain: [level(use(tracer)), level(use(auth))] }, (value, _p, ctx) => value !== `${ctx.user!}-taken`);
    const userForm = form({ alias: str('', [r.use()]) });
    const args = formTypes(userForm.$schema);
    const spec: FnSpec = { id: 'routes/usuarios', name: 'save', method: 'PUT', chain, wire: binWire, form: userForm as never, args };
    const contract = fn(spec);
    contract.handle(handler as never);
    return { contract, args };
  }
  const global: string[] = [];
  const tracer = middleware({ id: 'middlewares/own', name: 'global', server: true });
  tracer.server((ctx, next) => {
    global.push('global');
    return next(ctx);
  });

  const put = (args: Readonly<Record<string, Ty>>, alias: string, cookie?: string) => {
    const { headers, body } = binBody(args, { alias });
    return new Request('https://app.test/_fudic/fn/routes/usuarios/save', {
      method: 'PUT',
      body,
      headers: { ...headers, ...(cookie !== undefined ? { cookie } : {}) },
    });
  };

  it('auth runs around the check with the ctx of the function; its failure is a 422 on the field', async () => {
    const handler = vi.fn(() => undefined);
    const { contract, args } = save(handler);
    const res = await serve({ request: put(args, 'pedro-taken', 'session=pedro'), contract, page: {}, route: {} });
    expect(res.status).toBe(422);
    expect((await binProblem(res)).errors).toEqual({ alias: { aliasTaken: true } });
    expect(handler).not.toHaveBeenCalled();
    // Its own level only: the function ran $global already.
    expect(global).toEqual([]);
    const ok = await serve({ request: put(args, 'pedro', 'session=pedro'), contract, page: {}, route: {} });
    expect(ok.status).toBe(204);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('without a session, the 401 of the rule auth is the answer of the submit', async () => {
    const { contract, args } = save(() => undefined);
    const res = await serve({ request: put(args, 'pedro'), contract, page: {}, route: {} });
    expect(res.status).toBe(401);
  });
});

describe('the type of the ctx of a check (criterion 9)', () => {
  it('after use auth the check reads ctx.user; without it, ctx.user is a type error', () => {
    const withAuth: Check<string, {}, never, ServerContext & { readonly user: string }> = (value, _p, ctx) => value !== ctx.user;
    const without: Check<string, {}, never, ServerContext> = (value, _p, ctx) =>
      // @ts-expect-error nothing in its chain added `user`.
      value !== ctx.user;
    // A `runs both` rule has no ctx at all.
    // @ts-expect-error a check of two arguments is given none third.
    const both: Check<string, {}> = (_value, _p, ctx: unknown) => ctx === undefined;
    expect([withAuth, without, both].every((f) => typeof f === 'function')).toBe(true);
  });
});
