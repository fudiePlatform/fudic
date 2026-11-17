/**
 * SDD-87 §3.5, criterion 4: a call of an app under a `base` stays in it. Its URL, the token
 * `csrf` asks for, and the `ctx.base` its client steps read, all carry `/admin/`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { middleware, stub, use, type FnSpec, type Level } from '../../src/contract/index.js';
import { ruleSend } from '../../src/contract/rule-send.js';
import { csrfClient } from '../../src/csrf-client.js';
import type { ClientContext } from '../../src/types.js';
import { jsonWire } from '../../src/wire/json.js';

afterEach(() => vi.unstubAllGlobals());

/** A level with `csrf` (token) and a step that keeps the `ctx` it saw. */
function chain(seen: ClientContext[]): Level {
  const csrf = middleware<{ readonly token?: boolean }>({ id: 'middlewares/csrf', name: 'csrf', client: true });
  csrf.client(csrfClient as never);
  const peek = middleware({ id: 'middlewares/peek', name: 'peek', client: true });
  peek.client(((ctx: ClientContext, next: (c: ClientContext) => unknown) => {
    seen.push(ctx);
    return next(ctx);
  }) as never);
  return { steps: [{ use: [use(csrf, { token: true }), use(peek)] }] };
}

/** `fetch` answering the token and the call; every URL it was asked. */
function served(): string[] {
  const asked: string[] = [];
  vi.stubGlobal('location', { origin: 'https://app.test', pathname: '/admin/fallos' });
  vi.stubGlobal('fetch', async (url: URL | string) => {
    const href = String(url);
    asked.push(new URL(href).pathname);
    if (href.endsWith('/_fudic/csrf')) return Response.json({ token: 't0k3n' });
    return new Response(null, { status: 204 });
  });
  return asked;
}

const spec = (seen: ClientContext[], over: Partial<FnSpec> = {}): FnSpec => ({
  id: 'routes/fallos',
  name: 'ok',
  method: 'POST',
  wire: jsonWire,
  chain: [chain(seen)],
  ...over,
});

describe('a call under a base (criterion 4)', () => {
  it('goes to /admin/_fudic/fn/…, asks its token at /admin/_fudic/csrf, and its steps see ctx.base', async () => {
    const asked = served();
    const seen: ClientContext[] = [];
    await stub(spec(seen, { base: '/admin/' }))({} as never);
    expect(asked).toEqual(['/admin/_fudic/csrf', '/admin/_fudic/fn/routes/fallos/ok']);
    expect(seen.map((c) => c.base)).toEqual(['/admin/']);
  });

  it('without a base, ctx.base is /', async () => {
    const asked = served();
    const seen: ClientContext[] = [];
    await stub(spec(seen, { id: 'routes/sin-base' }))({} as never);
    expect(asked.at(-1)).toBe('/_fudic/fn/routes/sin-base/ok');
    expect(seen.map((c) => c.base)).toEqual(['/']);
  });
});

describe('ruleSend and its base (SDD-87 §3.5)', () => {
  it('the steps of a question see the base it was given, and / without one', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 200 }));
    const seen: ClientContext[] = [];
    const peek = middleware({ id: 'middlewares/peek-rule', name: 'peek', client: true });
    peek.client(((ctx: ClientContext, next: (c: ClientContext) => unknown) => {
      seen.push(ctx);
      return next(ctx);
    }) as never);
    const levels = (): readonly Level[] => [{ steps: [{ use: [use(peek)] }] }];
    const init = { method: 'POST', headers: new Headers(), signal: new AbortController().signal };
    await ruleSend('taken', levels, '/admin/')(new URL('https://app.test/admin/_fudic/rule/x/taken'), init);
    await ruleSend('taken', levels)(new URL('https://app.test/_fudic/rule/x/taken'), init);
    expect(seen.map((c) => c.base)).toEqual(['/admin/', '/']);
  });
});
