/**
 * SDD-56 §4.6 and criteria 14–20: from a `Request` to a `Response`, for one server function — a
 * function of a `.fudapi` since SDD-60, served by `contract/server.ts`.
 *
 * Every request here is a real `Request`, and every answer is read back from the `Response`
 * as a client would: status, headers, body.
 */

import { describe, expect, it, vi } from 'vitest';
import { createRoot, inject, Service } from '@fudic/di';
import { control, form, serverValidator } from '@fudic/forms/contract';
import { fn, middleware, use, type AnyPiece, type FnSpec, type Level } from '../../src/contract/index.js';
import { serve } from '../../src/contract/server.js';
import { badRequest, notFound, redirect } from '../../src/errors.js';
import { PROBLEM_TYPE } from '../../src/server/problem.js';
import type { DispatchOptions } from '../../src/server/dispatch.js';
import type { ServerContext } from '../../src/types.js';

const URL_SAVE = 'https://app.test/_fudic/fn/routes/usuarios/save';

/** A `ctx` as a handler of these tests reads it: what the declaration types, loosely. */
type Ctx = ServerContext<any> & { readonly form: any; readonly [added: string]: any };

/** `save` of `routes/usuarios`, implemented by `handler`; a `PUT` unless `over` says otherwise. */
function target(handler: (ctx: Ctx) => unknown, over: Partial<FnSpec> = {}) {
  const contract = fn({ id: 'routes/usuarios', name: 'save', method: 'PUT', chain: [], ...over });
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

const putJson = (body: unknown, init: { headers?: Record<string, string>; signal?: AbortSignal } = {}) =>
  new Request(URL_SAVE, {
    method: 'PUT',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...(init.signal !== undefined ? { signal: init.signal } : {}),
    headers: { 'content-type': 'application/json', ...init.headers },
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

describe('the arguments', () => {
  it('a GET reads ?a= as JSON', async () => {
    const save = get((ctx) => ({ got: ctx.args }));
    const a = encodeURIComponent(JSON.stringify({ q: 'ana' }));
    const res = await dispatch(new Request(`${URL_SAVE}?a=${a}`), save);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ got: { q: 'ana' } });
  });

  it('a GET without ?a= has undefined args', async () => {
    const res = await dispatch(new Request(URL_SAVE), get((ctx) => ({ isUndefined: ctx.args === undefined })));
    expect(await res.json()).toEqual({ isUndefined: true });
  });

  it('the rest read the JSON body; an empty body is undefined', async () => {
    const save = target((ctx) => ({ args: ctx.args ?? 'none' }));
    expect(await (await dispatch(putJson({ id: 7 }), save)).json()).toEqual({ args: { id: 7 } });
    const empty = new Request(URL_SAVE, { method: 'PUT' });
    expect(await (await dispatch(empty, save)).json()).toEqual({ args: 'none' });
  });

  it('broken JSON is a 400, and handle never runs', async () => {
    const handle = vi.fn();
    const res = await dispatch(putJson('{nope'), target(handle));
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toBe(PROBLEM_TYPE);
    expect((await res.json()).title).toBe('Bad Request');
    expect(handle).not.toHaveBeenCalled();
  });

  it('broken JSON in ?a= is a 400 too', async () => {
    const res = await dispatch(new Request(`${URL_SAVE}?a=%7Bnope`), get(() => 1));
    expect(res.status).toBe(400);
  });
});

describe('the ctx (§4.6 step 2)', () => {
  it('carries method, name, url and params', async () => {
    const rename = target(
      (ctx) => ({ side: ctx.side, method: ctx.method, name: ctx.name, url: ctx.url.href, params: ctx.params }),
      { name: 'rename' },
    );
    const res = await dispatch(putJson(null), rename, {}, { slug: 'a' });
    expect(await res.json()).toEqual({
      side: 'server',
      method: 'PUT',
      name: 'rename',
      url: URL_SAVE,
      params: { slug: 'a' },
    });
  });

  it('carries the request headers', async () => {
    const res = await dispatch(putJson(null, { headers: { 'x-who': 'ana' } }), target((ctx) => ctx.headers.get('x-who')));
    expect(await res.json()).toBe('ana');
  });
});

describe('criterion 15: cookies in, set-cookie out', () => {
  it('ctx.cookies reads Cookie: a=1; b=2', async () => {
    const res = await dispatch(new Request(URL_SAVE, { headers: { cookie: 'a=1; b=2' } }), get((ctx) => Object.fromEntries(ctx.cookies)));
    expect(await res.json()).toEqual({ a: '1', b: '2' });
  });

  it('ctx.response.headers.append("set-cookie", …) reaches the response', async () => {
    const save = target((ctx) => {
      ctx.response.headers.append('set-cookie', 'sid=abc; HttpOnly');
      ctx.response.headers.append('set-cookie', 'theme=dark');
      return { ok: true };
    });
    const res = await dispatch(putJson(null), save);
    expect(res.headers.getSetCookie()).toEqual(['sid=abc; HttpOnly', 'theme=dark']);
    expect(res.headers.get('content-type')).toBe('application/json');
  });

  it('set-cookie reaches a 204 too', async () => {
    const save = target((ctx) => {
      ctx.response.headers.append('set-cookie', 'sid=gone; Max-Age=0');
    });
    const res = await dispatch(putJson(null), save);
    expect(res.status).toBe(204);
    expect(res.headers.getSetCookie()).toEqual(['sid=gone; Max-Age=0']);
  });

  it('ctx.response.status sets the status of a value', async () => {
    const save = target((ctx) => {
      ctx.response.status = 201;
      return { id: 1 };
    });
    expect((await dispatch(putJson(null), save)).status).toBe(201);
  });
});

describe('criterion 20: the value is the response', () => {
  it('undefined is a 204 with no body', async () => {
    const res = await dispatch(putJson(null), target(() => undefined));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  it('{ a: 1 } is a 200 with {"a":1}', async () => {
    const res = await dispatch(putJson(null), target(async () => ({ a: 1 })));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.text()).toBe('{"a":1}');
  });

  it('null is a value, not an absence: 200 with null', async () => {
    const res = await dispatch(putJson(null), target(() => null));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('null');
  });
});

describe('criterion 19: errors', () => {
  it('throw notFound("x") is 404 with its problem', async () => {
    const res = await dispatch(putJson(null), target(() => { throw notFound('x'); }));
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe(PROBLEM_TYPE);
    expect(await res.json()).toEqual({ status: 404, title: 'Not Found', detail: 'x' });
  });

  it('throw new Error("secreto") in a build: 500 without the message', async () => {
    const res = await dispatch(putJson(null), target(() => { throw new Error('secreto'); }));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('secreto');
    expect(JSON.parse(text)).toEqual({ status: 500, title: 'Internal Server Error' });
  });

  it('in dev: with it, in detail', async () => {
    const res = await dispatch(putJson(null), target(() => { throw new Error('secreto'); }), { dev: true });
    expect(await res.json()).toEqual({ status: 500, title: 'Internal Server Error', detail: 'secreto' });
  });

  it('something thrown that is not an Error is a 500 too', async () => {
    expect(await (await dispatch(putJson(null), target(() => { throw 'plain'; }), { dev: true })).json()).toEqual({
      status: 500,
      title: 'Internal Server Error',
      detail: 'plain',
    });
  });

  it('onError hears what is not an HttpError, and only that', async () => {
    const onError = vi.fn();
    const boom = new Error('boom');
    await dispatch(putJson(null), target(() => { throw boom; }), { onError });
    expect(onError).toHaveBeenCalledWith(boom);
    onError.mockClear();
    await dispatch(putJson(null), target(() => { throw badRequest(); }), { onError });
    await dispatch(putJson('{x'), target(() => 1), { onError });
    expect(onError).not.toHaveBeenCalled();
  });

  it('a Redirect keeps its 3xx and its location in the body, with no Location header', async () => {
    const res = await dispatch(putJson(null), target(() => { throw redirect('/login'); }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBeNull();
    expect(await res.json()).toEqual({ status: 303, title: 'See Other', location: '/login' });
  });

  it('an error thrown by a middleware is answered the same way', async () => {
    const deny = serverHalf('deny', () => { throw notFound('mw'); });
    const res = await dispatch(putJson(null), target(() => 1, { chain: [level(deny)] }));
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
    await dispatch(putJson(null), save);
    expect(trace).toEqual(['global', 'file', 'fn', 'handle']);
  });

  it('what a middleware leaves in ctx reaches handle', async () => {
    const auth = serverHalf<{ user: string }>('auth', (ctx, next) => next(Object.assign(ctx, { user: 'ana' }) as never));
    const res = await dispatch(putJson(null), target((ctx) => ctx['user'], { chain: [level(auth)] }));
    expect(await res.json()).toBe('ana');
  });
});

describe('criterion 24, the server half: the signal', () => {
  it('ctx.signal aborts when the client cuts the connection', async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const save = target(async (ctx) => {
      seen = ctx.signal;
      expect(ctx.signal.aborted).toBe(false);
      controller.abort();
      await tick(1);
      return ctx.signal.aborted;
    });
    const res = await dispatch(putJson(null, { signal: controller.signal }), save);
    expect(await res.json()).toBe(true);
    expect(seen!.aborted).toBe(true);
  });
});

describe('criterion 14: two concurrent requests, each its own container', () => {
  it('an await between two inject(Cart) does not cross them', async () => {
    const save = target(async (ctx) => {
      const first = inject(Cart);
      await tick((ctx.args as { wait: number }).wait);
      const second = inject(Cart);
      return { first: first.id, second: second.id };
    });
    // The slow one starts first: the fast one runs entirely inside its await.
    const [slow, fast] = await Promise.all([
      dispatch(putJson({ wait: 20 }), save).then((r) => r.json()),
      dispatch(putJson({ wait: 1 }), save).then((r) => r.json()),
    ]);
    expect(slow.first).toBe(slow.second);
    expect(fast.first).toBe(fast.second);
    expect(slow.first).not.toBe(fast.first);
  });
});

describe('form: the validation, just before handle', () => {
  const taken = serverValidator<string>((v) => (v === 'taken@x.es' ? { taken: true } : null));
  const userForm = form({ name: control(''), email: control('', [taken]) });

  it('criterion 16: ctx.form is a fresh form with the value sent, never userForm', async () => {
    let seen: unknown;
    const save = target(
      (ctx) => {
        seen = ctx.form;
        return ctx.form.$value();
      },
      { form: userForm as never },
    );
    const sent = { name: 'Pedro', email: 'pedro@x.es' };
    const res = await dispatch(putJson(sent), save);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(sent);
    expect(seen).not.toBe(userForm);
    expect(userForm.$value()).toEqual({ name: '', email: '' });
  });

  it('criterion 16: two requests at once do not share an instance', async () => {
    const forms: unknown[] = [];
    const save = target(
      async (ctx) => {
        forms.push(ctx.form);
        const before = ctx.form.name();
        await tick(5);
        return { before, after: ctx.form.name() };
      },
      { form: userForm as never },
    );
    const [a, b] = await Promise.all([
      dispatch(putJson({ name: 'a', email: '' }), save).then((r) => r.json()),
      dispatch(putJson({ name: 'b', email: '' }), save).then((r) => r.json()),
    ]);
    expect(a).toEqual({ before: 'a', after: 'a' });
    expect(b).toEqual({ before: 'b', after: 'b' });
    expect(forms[0]).not.toBe(forms[1]);
  });

  it('criterion 17: a body that fails a serverValidator is 422 with the field key', async () => {
    const handle = vi.fn();
    const res = await dispatch(putJson({ name: 'P', email: 'taken@x.es' }), target(handle, { form: userForm as never }));
    expect(res.status).toBe(422);
    expect(res.headers.get('content-type')).toBe(PROBLEM_TYPE);
    const problem = await res.json();
    expect(problem).toMatchObject({ status: 422, title: 'Unprocessable Content' });
    expect(problem.errors).toEqual({ email: { taken: true } });
    expect(problem.summary).toBeNull();
    expect(handle).not.toHaveBeenCalled();
  });

  it('the 422 carries the summary of the form-level rule', async () => {
    const schema = { a: control(''), b: control('') };
    const pair = form(schema, { summary: (r) => (r.a() !== r.b() ? { mismatch: true } : null) });
    const res = await dispatch(putJson({ a: 'x', b: 'y' }), target(() => 1, { form: pair as never }));
    expect(res.status).toBe(422);
    const problem = await res.json();
    expect(problem.summary).toEqual({ mismatch: true });
    expect(problem.errors).toBeNull();
  });

  it('criterion 18: a body that is not the shape of the schema is 400', async () => {
    const handle = vi.fn();
    const res = await dispatch(putJson({ name: 'P' }), target(handle, { form: userForm as never }));
    expect(res.status).toBe(400);
    expect(handle).not.toHaveBeenCalled();
  });

  it('criterion 18: a body that is not even an object is 400', async () => {
    const res = await dispatch(putJson(42), target(() => 1, { form: userForm as never }));
    expect(res.status).toBe(400);
  });
});

describe('the container of a request', () => {
  it('is a fresh root by default, or the one `container` makes', async () => {
    const save = get(() => inject(Cart).id);
    const first = await (await dispatch(new Request(URL_SAVE), save)).json();
    const second = await (await dispatch(new Request(URL_SAVE), save)).json();
    expect(second).not.toBe(first);
    const made = vi.fn(() => createRoot());
    await dispatch(new Request(URL_SAVE), save, { container: made });
    expect(made).toHaveBeenCalledOnce();
  });
});
