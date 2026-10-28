/**
 * SDD-56 §4.6 and criteria 14–20: from a `Request` to a `Response`, for one server function — a
 * function of a `.fudapi` since SDD-60, served by `contract/server.ts`, in `fud-bin` unless its
 * chain says `use json` (SDD-67 §3.2, §4.1).
 *
 * Every request here is a real `Request`, and every answer is read back from the `Response`
 * as a client would: status, headers, body.
 */

import { describe, expect, it, vi } from 'vitest';
import { createRoot, inject, Service } from '@fudic/di';
import { form, serverValidator, str } from '@fudic/forms/contract';
import { fn, middleware, use, type AnyPiece, type FnSpec, type Level } from '../../src/contract/index.js';
import { serve } from '../../src/contract/server.js';
import { badRequest, notFound, redirect } from '../../src/errors.js';
import type { DispatchOptions } from '../../src/server/dispatch.js';
import type { ServerContext } from '../../src/types.js';
import { toBase64url } from '../../src/wire/base64url.js';
import { binWire } from '../../src/wire/bin.js';
import { jsonWire } from '../../src/wire/json.js';
import { formTypes } from '../../src/wire/schema.js';
import type { Ty } from '../../src/wire/ty.js';
import { binBody, binProblem, binValue } from '../helpers.js';

const URL_SAVE = 'https://app.test/_fudic/fn/routes/usuarios/save';

/** A `ctx` as a handler of these tests reads it: what the declaration types, loosely. */
type Ctx = ServerContext<any> & { readonly form: any; readonly [added: string]: any };

/** `save` of `routes/usuarios`, implemented by `handler`; a `PUT` unless `over` says otherwise. */
function target(handler: (ctx: Ctx) => unknown, over: Partial<FnSpec> = {}) {
  const contract = fn({ id: 'routes/usuarios', name: 'save', method: 'PUT', chain: [], wire: binWire, ...over });
  contract.handle(handler as never);
  return contract;
}

/** A `GET` function. */
const get = (handler: (ctx: Ctx) => unknown, over: Partial<FnSpec> = {}) => target(handler, { method: 'GET', ...over });

/** The request served by the function, with the page's params. */
const dispatch = (
  request: Request,
  contract: ReturnType<typeof target>,
  options: DispatchOptions = {},
  page: Readonly<Record<string, string>> = {},
) => serve({ request, contract, page, route: {} }, options);

/** A level that uses these middlewares. */
const level = (...pieces: readonly AnyPiece[]): Level => ({ steps: [{ use: pieces.map((p) => use(p as never)) }] });

interface Init {
  readonly headers?: Record<string, string>;
  readonly signal?: AbortSignal;
}

const signalOf = (init: Init) => (init.signal !== undefined ? { signal: init.signal } : {});

/** A PUT without a body. */
const put = (init: Init = {}) => new Request(URL_SAVE, { method: 'PUT', ...signalOf(init), headers: { ...init.headers } });

/** A PUT whose body is `args` in `fud-bin`. */
const putBin = (types: Readonly<Record<string, Ty>>, args: Readonly<Record<string, unknown>>, init: Init = {}) => {
  const { headers, body } = binBody(types, args);
  return new Request(URL_SAVE, { method: 'PUT', body, ...signalOf(init), headers: { ...headers, ...init.headers } });
};

/** A PUT whose body is these bytes, said to be `fud-bin`. */
const putBytes = (bytes: readonly number[]) =>
  new Request(URL_SAVE, { method: 'PUT', body: Uint8Array.from(bytes), headers: { 'content-type': binWire.type } });

/** A PUT whose body is JSON. */
const putJson = (body: unknown) =>
  new Request(URL_SAVE, {
    method: 'PUT',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Cart {
  static count = 0;
  readonly id = ++Cart.count;
}
Service(Cart);

/** A middleware piece with only a server half, already implemented. */
function serverHalf<Adds extends object = {}>(name: string, half: (ctx: ServerContext, next: (c: never) => Promise<unknown>) => unknown) {
  const piece = middleware<{}, Adds>({ id: 'middlewares/test', name, server: true });
  piece.server(half as never);
  return piece;
}

const PROBLEM_FUD = 'application/problem+fud';
const PROBLEM_JSON = 'application/problem+json';
const type = (fields: Record<string, Ty>): Ty => ({ fields: () => fields });

describe('the arguments, in fud-bin', () => {
  it('criterion 6: a GET reads ?a= as the level of its arguments, in base64url', async () => {
    const types: Record<string, Ty> = { q: 'str' };
    const search = get((ctx) => ctx.args.q, { args: types, returns: 'str' });
    const a = toBase64url(binWire.encodeArgs(types, { q: 'ana' }) as Uint8Array);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/u);
    const res = await dispatch(new Request(`${URL_SAVE}?a=${a}`), search);
    expect(res.status).toBe(200);
    expect(await binValue(res, 'str')).toBe('ana');
  });

  it('a GET without ?a=, or with it empty, has no arguments', async () => {
    const save = get((ctx) => ctx.args === undefined, { returns: 'bool' });
    expect(await binValue(await dispatch(new Request(URL_SAVE), save), 'bool')).toBe(true);
    const opt = get((ctx) => JSON.stringify(ctx.args), { args: { q: { opt: 'str' } }, returns: 'str' });
    expect(await binValue(await dispatch(new Request(`${URL_SAVE}?a=`), opt), 'str')).toBe('{}');
  });

  it('?a= that is not base64url is a 400', async () => {
    for (const a of ['%2B%2F', 'A']) {
      const res = await dispatch(new Request(`${URL_SAVE}?a=${a}`), get(() => 1, { args: { q: 'str' } }));
      expect(res.status).toBe(400);
      expect((await binProblem(res)).detail).toBe('the arguments are not valid base64url');
    }
  });

  it('the rest read the body as the level of their arguments; an empty body is none', async () => {
    const types: Record<string, Ty> = { id: 'u8', note: { opt: 'str' } };
    const save = target((ctx) => JSON.stringify(ctx.args), { args: types, returns: 'str' });
    expect(await binValue(await dispatch(putBin(types, { id: 7 }), save), 'str')).toBe('{"id":7}');
    const opt = target((ctx) => JSON.stringify(ctx.args), { args: { note: { opt: 'str' } }, returns: 'str' });
    expect(await binValue(await dispatch(put(), opt), 'str')).toBe('{}');
  });

  it('criterion 5: one bool argument in the body is one byte, 0x00', async () => {
    const save = target((ctx) => ctx.args.active === false, { args: { active: 'bool' }, returns: 'bool' });
    expect(await binValue(await dispatch(putBytes([0]), save), 'bool')).toBe(true);
  });

  it('criterion 3: every hostile body is a 400 whose detail says binary body, and handle never runs', async () => {
    const handle = vi.fn();
    const cases: [Record<string, Ty>, number[]][] = [
      [{ n: 'u32' }, [1, 2]], // truncated
      [{ n: 'u8' }, [1, 2]], // bytes to spare
      [{ s: 'str' }, [0x80, 0x80, 0x80, 0x80, 0x10, 0x61]], // a str of 2^32 bytes
      [{ c: { oneOf: ['a', 'b', 'c'] } }, [9]], // an enum index 9 of 3
      [{ x: 'any' }, [7]], // an any with tag 7
    ];
    for (const [args, bytes] of cases) {
      const res = await dispatch(putBytes(bytes), target(handle, { args }));
      expect(res.status).toBe(400);
      expect(res.headers.get('content-type')).toBe(PROBLEM_FUD);
      expect((await binProblem(res)).detail).toMatch(/^binary body: /u);
    }
    expect(handle).not.toHaveBeenCalled();
  });

  it('a value that reads whole but is not of its type is a 400 too', async () => {
    const handle = vi.fn();
    const res = await dispatch(putBytes([0, 0, 0, 0, 0, 0x80]), target(handle, { args: { at: 'date' } }));
    expect(res.status).toBe(400);
    expect((await binProblem(res)).detail).toBe('argument at is not a valid date');
    expect(handle).not.toHaveBeenCalled();
  });
});

describe('the arguments, with use json', () => {
  it('a GET reads ?a= as JSON', async () => {
    const search = get((ctx) => ctx.args, { args: { q: 'str' }, returns: type({ q: 'str' }), wire: jsonWire });
    const a = encodeURIComponent(JSON.stringify({ q: 'ana' }));
    const res = await dispatch(new Request(`${URL_SAVE}?a=${a}`), search);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({ q: 'ana' });
  });

  it('the body with its keys, its dates revived', async () => {
    const save = target((ctx) => ctx.args.at instanceof Date, { args: { at: 'date' }, returns: 'bool', wire: jsonWire });
    const res = await dispatch(putJson({ at: '2020-01-01T00:00:00.000Z' }), save);
    expect(await res.json()).toBe(true);
  });

  it('broken JSON is a 400 in problem+json, and handle never runs', async () => {
    const handle = vi.fn();
    const res = await dispatch(putJson('{nope'), target(handle, { args: { a: 'u8' }, wire: jsonWire }));
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toBe(PROBLEM_JSON);
    expect(await res.json()).toEqual({ status: 400, title: 'Bad Request', detail: 'the body is not valid JSON' });
    expect(handle).not.toHaveBeenCalled();
  });

  it('broken JSON in ?a= is a 400 too', async () => {
    const res = await dispatch(new Request(`${URL_SAVE}?a=%7Bnope`), get(() => 1, { args: { a: 'u8' }, wire: jsonWire }));
    expect(res.status).toBe(400);
  });

  it('criterion 11: no fud-sig asked, none needed', async () => {
    const res = await dispatch(put(), target(() => true, { returns: 'bool', wire: jsonWire }));
    expect(res.status).toBe(200);
  });
});

describe('criterion 9: one format per function, no second door (415)', () => {
  it('JSON to a function in fud-bin', async () => {
    const handle = vi.fn();
    const res = await dispatch(putJson({ active: true }), target(handle, { args: { active: 'bool' } }));
    expect(res.status).toBe(415);
    expect(res.headers.get('content-type')).toBe(PROBLEM_FUD);
    expect((await binProblem(res)).detail).toBe('content-type "application/json"');
    expect(handle).not.toHaveBeenCalled();
  });

  it('fud-bin to a function with use json', async () => {
    const handle = vi.fn();
    const res = await dispatch(putBin({ active: 'bool' }, { active: true }), target(handle, { args: { active: 'bool' }, wire: jsonWire }));
    expect(res.status).toBe(415);
    expect(res.headers.get('content-type')).toBe(PROBLEM_JSON);
    expect(handle).not.toHaveBeenCalled();
  });

  it('a body with no content-type at all', async () => {
    const res = await dispatch(new Request(URL_SAVE, { method: 'PUT', body: Uint8Array.from([0]) }), target(() => 1, { args: { a: 'bool' } }));
    expect(res.status).toBe(415);
  });

  it('criterion 12: application/fud is gone', async () => {
    const req = new Request(URL_SAVE, { method: 'PUT', body: '[true]', headers: { 'content-type': 'application/fud' } });
    expect((await dispatch(req, target(() => 1, { args: { a: 'bool' } }))).status).toBe(415);
  });
});

describe('criterion 8: the signature (412)', () => {
  const SIG = '0a1b2c3d';

  it('the same fud-sig: served', async () => {
    const res = await dispatch(put({ headers: { 'fud-sig': SIG } }), target(() => true, { sig: SIG, returns: 'bool' }));
    expect(res.status).toBe(200);
  });

  it('another fud-sig, or none: 412 the page is older than the server, and handle never runs', async () => {
    const handle = vi.fn();
    const save = target(handle, { sig: SIG, args: { active: 'bool' } });
    for (const headers of [{ 'fud-sig': 'ffffffff' }, {}]) {
      const res = await dispatch(putBin({ active: 'bool' }, { active: true }, { headers }), save);
      expect(res.status).toBe(412);
      expect(res.headers.get('content-type')).toBe(PROBLEM_FUD);
      expect(await binProblem(res)).toEqual({ status: 412, title: 'Precondition Failed', detail: 'the page is older than the server' });
    }
    expect(handle).not.toHaveBeenCalled();
  });

  it('it is checked before the body is read: a broken body with a stale sig is a 412, not a 400', async () => {
    const req = new Request(URL_SAVE, { method: 'PUT', body: Uint8Array.from([1]), headers: { 'content-type': binWire.type, 'fud-sig': 'ffffffff' } });
    expect((await dispatch(req, target(() => 1, { sig: SIG, args: { n: 'u32' } }))).status).toBe(412);
  });
});

describe('the ctx (§4.6 step 2)', () => {
  it('carries method, name, url and params', async () => {
    const rename = target(
      (ctx) => ({ side: ctx.side, method: ctx.method, name: ctx.name, url: ctx.url.href, slug: ctx.params.slug }),
      { name: 'rename', returns: type({ side: 'str', method: 'str', name: 'str', url: 'str', slug: 'str' }) },
    );
    const res = await dispatch(put(), rename, {}, { slug: 'a' });
    expect(await binValue(res, type({ side: 'str', method: 'str', name: 'str', url: 'str', slug: 'str' }))).toEqual({
      side: 'server',
      method: 'PUT',
      name: 'rename',
      url: URL_SAVE,
      slug: 'a',
    });
  });

  it('carries the request headers', async () => {
    const res = await dispatch(put({ headers: { 'x-who': 'ana' } }), target((ctx) => ctx.headers.get('x-who'), { returns: 'str' }));
    expect(await binValue(res, 'str')).toBe('ana');
  });
});

describe('criterion 15: cookies in, set-cookie out', () => {
  it('ctx.cookies reads Cookie: a=1; b=2', async () => {
    const res = await dispatch(
      new Request(URL_SAVE, { headers: { cookie: 'a=1; b=2' } }),
      get((ctx) => Object.fromEntries(ctx.cookies), { returns: { map: ['str', 'str'] } }),
    );
    expect(await binValue(res, { map: ['str', 'str'] })).toEqual({ a: '1', b: '2' });
  });

  it('ctx.response.headers.append("set-cookie", …) reaches the response', async () => {
    const save = target(
      (ctx) => {
        ctx.response.headers.append('set-cookie', 'sid=abc; HttpOnly');
        ctx.response.headers.append('set-cookie', 'theme=dark');
        return true;
      },
      { returns: 'bool' },
    );
    const res = await dispatch(put(), save);
    expect(res.headers.getSetCookie()).toEqual(['sid=abc; HttpOnly', 'theme=dark']);
    expect(res.headers.get('content-type')).toBe('application/fud+bin');
  });

  it('set-cookie reaches a 204 too', async () => {
    const save = target((ctx) => {
      ctx.response.headers.append('set-cookie', 'sid=gone; Max-Age=0');
    });
    const res = await dispatch(put(), save);
    expect(res.status).toBe(204);
    expect(res.headers.getSetCookie()).toEqual(['sid=gone; Max-Age=0']);
  });

  it('ctx.response.status sets the status of a value', async () => {
    const save = target(
      (ctx) => {
        ctx.response.status = 201;
        return 1;
      },
      { returns: 'u8' },
    );
    expect((await dispatch(put(), save)).status).toBe(201);
  });
});

describe('criterion 20: the value is the response', () => {
  it('a function without -> is a 204 with no body, whatever handle returns', async () => {
    for (const value of [undefined, { a: 1 }]) {
      const res = await dispatch(put(), target(() => value));
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
    }
  });

  it('{ a: 1 } is a 200 with its level in fud-bin', async () => {
    const res = await dispatch(put(), target(async () => ({ a: 1 }), { returns: type({ a: 'u8' }) }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/fud+bin');
    expect([...new Uint8Array(await res.clone().arrayBuffer())]).toEqual([1]);
    expect(await binValue(res, type({ a: 'u8' }))).toEqual({ a: 1 });
  });

  it('an absent optional value is a 204', async () => {
    const res = await dispatch(put(), target(() => null, { returns: { opt: 'u8' } }));
    expect(res.status).toBe(204);
  });

  it('with use json, the JSON of the value', async () => {
    const res = await dispatch(put(), target(async () => ({ a: 1 }), { returns: type({ a: 'u8' }), wire: jsonWire }));
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.text()).toBe('{"a":1}');
  });

  it('criterion 4: a date value goes out as one, in both formats', async () => {
    const at = new Date('2020-02-29T12:00:00.000Z');
    const bin = await dispatch(put(), target(() => at, { returns: 'date' }));
    expect(((await binValue(bin, 'date')) as Date).getTime()).toBe(at.getTime());
    const json = await dispatch(put(), target(() => at, { returns: 'date', wire: jsonWire }));
    expect(await json.json()).toBe(at.toISOString());
  });
});

describe('criterion 10: a value that is not its -> is the handler’s fault', () => {
  const PERSON = type({ id: 'uuid', name: 'str' });

  it('a 500 whose detail names the field in dev', async () => {
    const res = await dispatch(put(), target(() => ({ id: 1, name: 'ana' }), { returns: PERSON }), { dev: true });
    expect(res.status).toBe(500);
    const problem = await binProblem(res);
    expect(problem.detail).toContain('value.id');
    expect(problem.detail).toBe('the handler returned a value that is not its ->: value.id is not a valid uuid');
  });

  it('a 500 with no detail in a build, heard by onError', async () => {
    const onError = vi.fn();
    const res = await dispatch(put(), target(() => ({ id: 1, name: 'ana' }), { returns: PERSON }), { onError });
    expect(res.status).toBe(500);
    expect(await binProblem(res)).toEqual({ status: 500, title: 'Internal Server Error' });
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe('criterion 19: errors', () => {
  it('criterion 7: throw notFound("x") is 404 with its problem, in problem+fud', async () => {
    const res = await dispatch(put(), target(() => { throw notFound('x'); }));
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe(PROBLEM_FUD);
    expect(await binProblem(res)).toEqual({ status: 404, title: 'Not Found', detail: 'x' });
  });

  it('with use json, in problem+json', async () => {
    const res = await dispatch(put(), target(() => { throw notFound('x'); }, { wire: jsonWire }));
    expect(res.headers.get('content-type')).toBe(PROBLEM_JSON);
    expect(await res.json()).toEqual({ status: 404, title: 'Not Found', detail: 'x' });
  });

  it('throw new Error("secreto") in a build: 500 without the message', async () => {
    const res = await dispatch(put(), target(() => { throw new Error('secreto'); }));
    expect(res.status).toBe(500);
    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    expect(new TextDecoder().decode(bytes)).not.toContain('secreto');
    expect(await binProblem(res)).toEqual({ status: 500, title: 'Internal Server Error' });
  });

  it('in dev: with it, in detail', async () => {
    const res = await dispatch(put(), target(() => { throw new Error('secreto'); }), { dev: true });
    expect(await binProblem(res)).toEqual({ status: 500, title: 'Internal Server Error', detail: 'secreto' });
  });

  it('something thrown that is not an Error is a 500 too', async () => {
    expect(await binProblem(await dispatch(put(), target(() => { throw 'plain'; }), { dev: true }))).toEqual({
      status: 500,
      title: 'Internal Server Error',
      detail: 'plain',
    });
  });

  it('onError hears what is not an HttpError, and only that', async () => {
    const onError = vi.fn();
    const boom = new Error('boom');
    await dispatch(put(), target(() => { throw boom; }), { onError });
    expect(onError).toHaveBeenCalledWith(boom);
    onError.mockClear();
    await dispatch(put(), target(() => { throw badRequest(); }), { onError });
    await dispatch(putBytes([1, 2]), target(() => 1, { args: { a: 'u8' } }), { onError });
    expect(onError).not.toHaveBeenCalled();
  });

  it('criterion 7: a Redirect keeps its 3xx and its location in the body, with no Location header', async () => {
    const res = await dispatch(put(), target(() => { throw redirect('/login'); }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBeNull();
    expect(await binProblem(res)).toEqual({ status: 303, title: 'See Other', location: '/login' });
  });

  it('an error thrown by a middleware is answered the same way', async () => {
    const deny = serverHalf('deny', () => { throw notFound('mw'); });
    const res = await dispatch(put(), target(() => 1, { chain: [level(deny)] }));
    expect(res.status).toBe(404);
  });
});

describe('the chain on the server', () => {
  it('runs global → file → function, server halves only', async () => {
    const trace: string[] = [];
    const mw = (name: string) => {
      const piece = middleware({ id: 'middlewares/test', name, client: true, server: true });
      piece.client(() => { trace.push(`client:${name}`); });
      piece.server((ctx, next) => (trace.push(name), next(ctx)));
      return piece;
    };
    const save = target(() => trace.push('handle'), { chain: [level(mw('global')), level(mw('file')), level(mw('fn'))] });
    await dispatch(put(), save);
    expect(trace).toEqual(['global', 'file', 'fn', 'handle']);
  });

  it('what a middleware leaves in ctx reaches handle', async () => {
    const auth = serverHalf<{ user: string }>('auth', (ctx, next) => next(Object.assign(ctx, { user: 'ana' }) as never));
    const res = await dispatch(put(), target((ctx) => ctx['user'], { chain: [level(auth)], returns: 'str' }));
    expect(await binValue(res, 'str')).toBe('ana');
  });
});

describe('criterion 24, the server half: the signal', () => {
  it('ctx.signal aborts when the client cuts the connection', async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const save = target(
      async (ctx) => {
        seen = ctx.signal;
        expect(ctx.signal.aborted).toBe(false);
        controller.abort();
        await tick(1);
        return ctx.signal.aborted;
      },
      { returns: 'bool' },
    );
    const res = await dispatch(put({ signal: controller.signal }), save);
    expect(await binValue(res, 'bool')).toBe(true);
    expect(seen!.aborted).toBe(true);
  });
});

describe('criterion 14: two concurrent requests, each its own container', () => {
  it('an await between two inject(Cart) does not cross them', async () => {
    const PAIR = type({ first: 'u32', second: 'u32' });
    const save = target(
      async (ctx) => {
        const first = inject(Cart);
        await tick(ctx.args.wait);
        const second = inject(Cart);
        return { first: first.id, second: second.id };
      },
      { args: { wait: 'u8' }, returns: PAIR },
    );
    // The slow one starts first: the fast one runs entirely inside its await.
    const [slow, fast] = (await Promise.all([
      dispatch(putBin({ wait: 'u8' }, { wait: 20 }), save).then((r) => binValue(r, PAIR)),
      dispatch(putBin({ wait: 'u8' }, { wait: 1 }), save).then((r) => binValue(r, PAIR)),
    ])) as { first: number; second: number }[];
    expect(slow!.first).toBe(slow!.second);
    expect(fast!.first).toBe(fast!.second);
    expect(slow!.first).not.toBe(fast!.first);
  });
});

describe('form: the validation, just before handle', () => {
  const taken = serverValidator<string>((v) => (v === 'taken@x.es' ? { taken: true } : null));
  const userForm = form({ name: str(''), email: str('', [taken]) });
  const args = formTypes(userForm.$schema);
  const USER = type({ name: 'str', email: 'str' });
  const putForm = (value: Record<string, unknown>) => putBin(args, value);

  it('criterion 16: ctx.form is a fresh form with the value sent, never userForm', async () => {
    let seen: unknown;
    const save = target(
      (ctx) => {
        seen = ctx.form;
        return ctx.form.$value();
      },
      { form: userForm as never, args, returns: USER },
    );
    const sent = { name: 'Pedro', email: 'pedro@x.es' };
    const res = await dispatch(putForm(sent), save);
    expect(res.status).toBe(200);
    expect(await binValue(res, USER)).toEqual(sent);
    expect(seen).not.toBe(userForm);
    expect(userForm.$value()).toEqual({ name: '', email: '' });
  });

  it('criterion 16: two requests at once do not share an instance', async () => {
    const forms: unknown[] = [];
    const BEFORE = type({ before: 'str', after: 'str' });
    const save = target(
      async (ctx) => {
        forms.push(ctx.form);
        const before = ctx.form.name();
        await tick(5);
        return { before, after: ctx.form.name() };
      },
      { form: userForm as never, args, returns: BEFORE },
    );
    const [a, b] = await Promise.all([
      dispatch(putForm({ name: 'a', email: '' }), save).then((r) => binValue(r, BEFORE)),
      dispatch(putForm({ name: 'b', email: '' }), save).then((r) => binValue(r, BEFORE)),
    ]);
    expect(a).toEqual({ before: 'a', after: 'a' });
    expect(b).toEqual({ before: 'b', after: 'b' });
    expect(forms[0]).not.toBe(forms[1]);
  });

  it('criterion 17: a body that fails a serverValidator is 422 with the field key', async () => {
    const handle = vi.fn();
    const res = await dispatch(putForm({ name: 'P', email: 'taken@x.es' }), target(handle, { form: userForm as never, args }));
    expect(res.status).toBe(422);
    expect(res.headers.get('content-type')).toBe(PROBLEM_FUD);
    const problem = await binProblem(res);
    expect(problem).toMatchObject({ status: 422, title: 'Unprocessable Content' });
    expect(problem.errors).toEqual({ email: { taken: true } });
    // A null summary has no place in fud-bin: it travels as absent.
    expect(problem.summary).toBeUndefined();
    expect(handle).not.toHaveBeenCalled();
  });

  it('the 422 carries the summary of the form-level rule', async () => {
    const schema = { a: str(''), b: str('') };
    const pair = form(schema, { summary: (r) => (r.a() !== r.b() ? { mismatch: true } : null) });
    const pairArgs = formTypes(pair.$schema);
    const res = await dispatch(putBin(pairArgs, { a: 'x', b: 'y' }), target(() => 1, { form: pair as never, args: pairArgs }));
    expect(res.status).toBe(422);
    const problem = await binProblem(res);
    expect(problem.summary).toEqual({ mismatch: true });
    expect(problem.errors).toBeUndefined();
  });

  it('criterion 18: a body that is not the shape of the schema is 400', async () => {
    const handle = vi.fn();
    const res = await dispatch(putBin({ name: 'str' }, { name: 'P' }), target(handle, { form: userForm as never, args }));
    expect(res.status).toBe(400);
    expect((await binProblem(res)).detail).toMatch(/^binary body: /u);
    expect(handle).not.toHaveBeenCalled();
  });

  it('criterion 18, with use json: a body that is not even an object is 400', async () => {
    const handle = vi.fn();
    const res = await dispatch(putJson(42), target(handle, { form: userForm as never, args, wire: jsonWire }));
    expect(res.status).toBe(400);
    expect(handle).not.toHaveBeenCalled();
  });

  it('criterion 12, with use json: the form with its keys', async () => {
    const save = target((ctx) => ctx.form.$value(), { form: userForm as never, args, returns: USER, wire: jsonWire });
    const res = await dispatch(putJson({ name: 'Ana', email: 'a@x.es' }), save);
    expect(await res.json()).toEqual({ name: 'Ana', email: 'a@x.es' });
  });
});

describe('the container of a request', () => {
  it('is a fresh root by default, or the one `container` makes', async () => {
    const save = get(() => inject(Cart).id, { returns: 'u32' });
    const first = await binValue(await dispatch(new Request(URL_SAVE), save), 'u32');
    const second = await binValue(await dispatch(new Request(URL_SAVE), save), 'u32');
    expect(second).not.toBe(first);
    const made = vi.fn(() => createRoot());
    await dispatch(new Request(URL_SAVE), save, { container: made });
    expect(made).toHaveBeenCalledOnce();
  });
});
