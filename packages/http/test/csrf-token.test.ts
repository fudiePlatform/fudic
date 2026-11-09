/**
 * SDD-81 §3.13, criteria 47 and 48: `use csrf` with `token true` — the signed double submit. The
 * token's endpoint and a function behind the `csrf` of `fudapi/middlewares.fudapi` are served by
 * the real `contractsHandler`, and the client half asks, keeps and retries against it.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fn, loadingFile, resetRegistry, use, type FnSpec } from '../src/contract/index.js';
import { contractsHandler } from '../src/contract/server.js';
import { decode } from '../src/client/codec.js';
import { run } from '../src/compose.js';
import { csrfClient } from '../src/csrf-client.js';
import { csrfServer } from '../src/csrf-server.js';
import { checkCsrfToken, csrfCookieName, csrfEndpoint, csrfToken, isCsrfPath, verifyCsrfToken } from '../src/csrf-token.js';
import { HttpError } from '../src/errors.js';
import { settle } from '../src/server/settings.js';
import { binWire } from '../src/wire/bin.js';
import { server as generated } from './built-ins.js';
import { clientCtx, serverCtx } from './helpers.js';

const ORIGIN = 'https://app.test';
const SECRET = 'a secret of the deployment';

/** `name=value` of a `Set-Cookie`. */
const pairOf = (setCookie: string): string => setCookie.split(';', 1)[0]!;

const save = (): void => {
  const spec: FnSpec = {
    id: 'routes/token',
    name: 'save',
    method: 'PUT',
    chain: [{ steps: [{ use: [use(generated.csrf, { token: true })] }] }],
    wire: binWire,
  };
  fn(spec).handle(() => undefined);
};

// Once for the file: resetting the registry between tests would also drop the server half
// `impl/` registered on the generated `csrf` when it was imported.
beforeAll(save);
afterAll(() => {
  loadingFile(undefined);
  resetRegistry();
});

/** The token endpoint asked as a page of this origin asks it, and what it set. */
async function ask(handle: (r: Request) => Promise<Response | null>, cookie?: string): Promise<{ token: string; cookie: string; response: Response }> {
  const response = (await handle(
    new Request(`${ORIGIN}/_fudic/csrf`, { headers: { 'sec-fetch-site': 'same-origin', ...(cookie !== undefined ? { cookie } : {}) } }),
  ))!;
  const set = response.headers.getSetCookie();
  const body = (await response.clone().json()) as { token: string };
  return { token: body.token, cookie: set.length > 0 ? pairOf(set[0]!) : (cookie ?? ''), response };
}

/** The function called with `token` in the header and `cookie`. */
const call = (handle: (r: Request) => Promise<Response | null>, token: string | undefined, cookie?: string): Promise<Response | null> =>
  handle(
    new Request(`${ORIGIN}/_fudic/fn/routes/token/save`, {
      method: 'PUT',
      headers: {
        'sec-fetch-site': 'same-origin',
        ...(token !== undefined ? { 'x-fudic-csrf': token } : {}),
        ...(cookie !== undefined ? { cookie } : {}),
      },
    }),
  );

describe('criterion 47: the token endpoint', () => {
  it('creates the cookie HttpOnly, SameSite=Strict, Path=/, of session, with the __Host- prefix, and gives its token', async () => {
    const { response, token } = await ask(contractsHandler({ secret: SECRET }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const [cookie] = response.headers.getSetCookie();
    expect(cookie).toMatch(/^__Host-fudic-csrf=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Strict$/u);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(token).toBe(await csrfToken(SECRET, pairOf(cookie!).split('=')[1]!));
  });

  it('without Secure cookies: fudic-csrf, no prefix, no Secure', async () => {
    const { response } = await ask(contractsHandler({ secret: SECRET, secureCookies: false }));
    expect(response.headers.getSetCookie()[0]).toMatch(/^fudic-csrf=[^;]+; Path=\/; HttpOnly; SameSite=Strict$/u);
  });

  it('a browser that has the cookie keeps it: same token, no Set-Cookie', async () => {
    const handle = contractsHandler({ secret: SECRET });
    const first = await ask(handle);
    const again = await ask(handle, first.cookie);
    expect(again.response.headers.getSetCookie()).toEqual([]);
    expect(again.token).toBe(first.token);
  });

  it('a cookie that is not one of ours is replaced', async () => {
    const { response } = await ask(contractsHandler({ secret: SECRET }), '__Host-fudic-csrf=short');
    expect(response.headers.getSetCookie()).toHaveLength(1);
  });

  it('another site: 403; another method: 405; under base only', async () => {
    const handle = contractsHandler({ secret: SECRET, base: '/app/' });
    const cross = await handle(new Request(`${ORIGIN}/app/_fudic/csrf`, { headers: { 'sec-fetch-site': 'cross-site' } }));
    expect(cross!.status).toBe(403);
    expect(cross!.headers.get('content-type')).toBe('application/problem+json');
    const post = await handle(new Request(`${ORIGIN}/app/_fudic/csrf`, { method: 'POST' }));
    expect(post!.status).toBe(405);
    // No Sec-Fetch-Site (curl): it answers.
    expect((await handle(new Request(`${ORIGIN}/app/_fudic/csrf`)))!.status).toBe(200);
    expect(isCsrfPath('/_fudic/csrf', '/app')).toBe(false);
  });
});

describe('criterion 47: a call with the token', () => {
  it('passes with the token of its cookie', async () => {
    const handle = contractsHandler({ secret: SECRET });
    const { token, cookie } = await ask(handle);
    expect((await call(handle, token, cookie))!.status).toBe(204);
  });

  it('with another token, a token of another cookie, or no cookie: 403 with the code csrfToken', async () => {
    const handle = contractsHandler({ secret: SECRET });
    const a = await ask(handle);
    const b = await ask(handle);
    for (const [token, cookie] of [
      ['x'.repeat(43), a.cookie],
      [b.token, a.cookie],
      [a.token, undefined],
      ['not a token at all', a.cookie],
    ] as const) {
      const response = await call(handle, token, cookie);
      expect(response!.status).toBe(403);
      expect(response!.headers.get('fud-code')).toBe('csrfToken');
    }
  });

  it('no header at all is the plain mode’s refusal: crossSite', async () => {
    const handle = contractsHandler({ secret: SECRET });
    const { cookie } = await ask(handle);
    const response = await call(handle, undefined, cookie);
    expect(response!.status).toBe(403);
    expect(response!.headers.get('fud-code')).toBe('crossSite');
  });

  it('a token signed with another secret does not pass', async () => {
    const { token, cookie } = await ask(contractsHandler({ secret: 'old secret' }));
    expect((await call(contractsHandler({ secret: SECRET }), token, cookie))!.status).toBe(403);
  });
});

describe('criterion 48: token mode without a secret', () => {
  it('the endpoint and the call are a 500 that says so, in production', async () => {
    const handle = contractsHandler({ dev: true });
    const endpoint = await handle(new Request(`${ORIGIN}/_fudic/csrf`));
    expect(endpoint!.status).toBe(500);
    expect(((await endpoint!.json()) as { detail: string }).detail).toBe('csrf token mode needs a secret (FUDIC_SECRET)');
    const prod = await contractsHandler()(new Request(`${ORIGIN}/_fudic/csrf`));
    expect(prod!.status).toBe(500);
    // A deployment mistake, said plainly even in production: it is an HttpError of its own.
    expect(((await prod!.json()) as { detail: string }).detail).toBe('csrf token mode needs a secret (FUDIC_SECRET)');
    const fnCall = await call(handle, 'y'.repeat(43), '__Host-fudic-csrf=' + 'z'.repeat(43));
    expect(fnCall!.status).toBe(500);
  });
});

describe('the pieces', () => {
  it('verifyCsrfToken: the token of the cookie, and nothing else', async () => {
    const token = await csrfToken(SECRET, 'c'.repeat(43));
    expect(await verifyCsrfToken(SECRET, 'c'.repeat(43), token)).toBe(true);
    expect(await verifyCsrfToken(SECRET, 'd'.repeat(43), token)).toBe(false);
    expect(await verifyCsrfToken(SECRET, 'c'.repeat(43), `${token}=`)).toBe(false);
  });

  it('csrfCookieName follows secureCookies', () => {
    expect(csrfCookieName({ secureCookies: true })).toBe('__Host-fudic-csrf');
    expect(csrfCookieName({ secureCookies: false })).toBe('fudic-csrf');
  });

  it('csrfEndpoint without a secret throws its 500', async () => {
    await expect(csrfEndpoint(new Request(`${ORIGIN}/_fudic/csrf`), { secureCookies: true })).rejects.toThrow(HttpError);
  });

  it('checkCsrfToken reads the settings the server left on the response', async () => {
    const response = { status: 200, headers: new Headers() };
    settle(response, { secureCookies: false, secret: SECRET });
    const cookie = 'e'.repeat(43);
    const token = await csrfToken(SECRET, cookie);
    expect(await checkCsrfToken({ cookies: new Map([['fudic-csrf', cookie]]), response }, token)).toBe('ok');
    expect(await checkCsrfToken({ cookies: new Map([['__Host-fudic-csrf', cookie]]), response }, token)).toBe('bad');
    // A response nobody settled: production's defaults, and no secret.
    await expect(checkCsrfToken({ cookies: new Map(), response: {} }, token)).rejects.toThrow('FUDIC_SECRET');
  });

  it('the server half lets a GET through without looking, token or not', async () => {
    await expect(run([csrfServer] as never, serverCtx('GET'), () => 'handled')).resolves.toBe('handled');
    await expect(
      run([(ctx: never, next: never) => csrfServer(ctx, next, { token: true })] as never, serverCtx('GET'), () => 'handled'),
    ).resolves.toBe('handled');
  });
});

describe('criterion 47: the client half asks once, keeps it, and retries once', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  /** A browser in front of `handle`: it keeps the cookies it is given and sends them back. */
  function browser(handle: (r: Request) => Promise<Response | null>) {
    const jar = new Map<string, string>();
    const send = async (request: Request): Promise<Response> => {
      const headers = new Headers(request.headers);
      headers.set('sec-fetch-site', 'same-origin');
      if (jar.size > 0) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
      const response = (await handle(new Request(request, { headers })))!;
      for (const set of response.headers.getSetCookie()) {
        const [name, value] = pairOf(set).split('=') as [string, string];
        jar.set(name, value);
      }
      return response;
    };
    const asks = vi.fn((input: RequestInfo | URL, init?: RequestInit) => send(new Request(input, init)));
    globalThis.fetch = asks as typeof fetch;
    return { jar, send, asks };
  }

  /** A call of `save` through the client half, as the stub makes it: decoded, a failure thrown. */
  const callThrough = (send: (r: Request) => Promise<Response>, path = '/_fudic/fn/routes/token/save') => {
    const ctx = clientCtx('PUT');
    const url = new URL(`${ORIGIN}${path}`);
    return run([(c: never, next: never) => csrfClient(c, next, { token: true })] as never, { ...ctx, url }, async (c) =>
      decode(await send(new Request(c.url, { method: 'PUT', headers: c.headers })), { wire: binWire, fails: { csrfToken: 'bad token' } }),
    );
  };

  it('asks the token once for the life of the page, and the call passes', async () => {
    const { send, asks } = browser(contractsHandler({ secret: SECRET }));
    await expect(callThrough(send)).resolves.toBeUndefined();
    await expect(callThrough(send)).resolves.toBeUndefined();
    expect(asks).toHaveBeenCalledOnce();
    expect(String(asks.mock.calls[0]![0])).toBe(`${ORIGIN}/_fudic/csrf`);
  });

  it('the cookie lost: one 403, a new token, and the call ends well', async () => {
    const { send, jar, asks } = browser(contractsHandler({ secret: SECRET }));
    // A page under its base asks under its base.
    await callThrough(send);
    jar.clear();
    await expect(callThrough(send)).resolves.toBeUndefined();
    expect(asks).toHaveBeenCalledTimes(2);
  });

  it('a second refusal is the call’s failure: it retries once only', async () => {
    const asks = vi.fn(async () => new Response(JSON.stringify({ token: 'nope' }), { status: 200 }));
    globalThis.fetch = asks as never;
    const refuse = vi.fn(async () => {
      throw new HttpError({ status: 403, title: 'Forbidden', code: 'csrfToken' });
    });
    const ctx = { ...clientCtx('PUT'), url: new URL(`${ORIGIN}/app/_fudic/fn/x/save`) };
    await expect(run([(c: never, next: never) => csrfClient(c, next, { token: true })] as never, ctx, refuse)).rejects.toThrow(HttpError);
    expect(refuse).toHaveBeenCalledTimes(2);
    expect(asks.mock.calls.map((c) => String((c as unknown[])[0]))).toContain(`${ORIGIN}/app/_fudic/csrf`);
  });

  // Tokens are kept per origin and base for the life of the page: each test below has a base of its own.
  it('a remote rule’s question answers with a Response: a 403 csrfToken there retries too', async () => {
    let n = 0;
    globalThis.fetch = (async () => new Response(JSON.stringify({ token: `t${++n}` }))) as never;
    const answers = [new Response(null, { status: 403, headers: { 'fud-code': 'csrfToken' } }), new Response('ok')];
    const seen: string[] = [];
    const ctx = { ...clientCtx('POST'), url: new URL(`${ORIGIN}/rq/_fudic/rule/rules/r/q`) };
    const out = await run([(c: never, next: never) => csrfClient(c, next, { token: true })] as never, ctx, async (c: { headers: Headers }) => {
      seen.push(c.headers.get('x-fudic-csrf')!);
      return answers.shift();
    });
    expect(await (out as Response).text()).toBe('ok');
    expect(seen).toEqual(['t1', 't2']);
  });

  it('another failure is not retried, nor a 403 of another code', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ token: 't' }))) as never;
    const boom = new Error('network');
    const ctx = { ...clientCtx('PUT'), url: new URL(`${ORIGIN}/other/_fudic/fn/a`) };
    const step = [(c: never, next: never) => csrfClient(c, next, { token: true })] as never;
    await expect(run(step, ctx, async () => Promise.reject(boom))).rejects.toBe(boom);
    const other = new Response(null, { status: 403, headers: { 'fud-code': 'crossSite' } });
    const terminal = vi.fn(async () => other);
    expect(await run(step, ctx, terminal)).toBe(other);
    expect(terminal).toHaveBeenCalledOnce();
  });

  it('an ask that fails is not kept: the next call asks again', async () => {
    const asks = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 't' })));
    globalThis.fetch = asks as never;
    const ctx = { ...clientCtx('PUT'), url: new URL(`${ORIGIN}/failing/_fudic/fn/a`) };
    const step = [(c: never, next: never) => csrfClient(c, next, { token: true })] as never;
    await expect(run(step, ctx, async () => 'done')).rejects.toThrow('CSRF token unavailable');
    await expect(run(step, ctx, async () => 'done')).resolves.toBe('done');
    expect(asks).toHaveBeenCalledTimes(2);
  });

  it('a GET, or the plain mode, sends the plain header and asks nothing', async () => {
    const asks = vi.fn();
    globalThis.fetch = asks as never;
    const seen: (string | null)[] = [];
    const terminal = async (c: { headers: Headers }) => seen.push(c.headers.get('x-fudic-csrf'));
    await run([(c: never, next: never) => csrfClient(c, next, { token: true })] as never, clientCtx('GET'), terminal);
    await run([csrfClient] as never, clientCtx('PUT'), terminal);
    expect(seen).toEqual(['1', '1']);
    expect(asks).not.toHaveBeenCalled();
  });
});
