/**
 * SDD-56 §6 criterion 6 and §4.4: one chain, two walks. `compose(…, 'client')` keeps the
 * client halves, `compose(…, 'server')` the server ones, and a plain function is in both.
 * Plus where `.compress` lands: the innermost level that writes it wins (§3.3).
 */

import { describe, expect, it } from 'vitest';
import { chain, levelOfChain } from '../src/chain.js';
import { compose, run } from '../src/compose.js';
import { put } from '../src/builder.js';
import { halfOf, middleware } from '../src/middleware.js';
import type { ClientStep, ServerStep, SharedMiddleware } from '../src/types.js';
import { clientCtx, serverCtx } from './helpers.js';

describe('criterion 6: which half runs on which side', () => {
  const ran: string[] = [];
  const f: ClientStep = (ctx, next) => (ran.push('f'), next(ctx));
  const g: ServerStep = (ctx, next) => (ran.push('g'), next(ctx));
  const both = middleware().client(f).server(g);
  const shared: SharedMiddleware = (ctx, next) => (ran.push('shared'), next(ctx));
  const fn = put().use(both, shared).handle(() => 'done');

  it('the client walk runs f and the shared function, never g', async () => {
    ran.length = 0;
    const { steps } = compose([fn.level], 'client');
    expect(steps).toEqual([f, shared]);
    expect(await run(steps, clientCtx(), () => 'sent')).toBe('sent');
    expect(ran).toEqual(['f', 'shared']);
  });

  it('the server walk runs g and the shared function, never f', async () => {
    ran.length = 0;
    const { steps } = compose([fn.level], 'server');
    expect(steps).toEqual([g, shared]);
    expect(await run(steps, serverCtx(), fn.handle)).toBe('done');
    expect(ran).toEqual(['g', 'shared']);
  });

  it('a middleware with only one half is absent from the other side', () => {
    const onlyClient = middleware().client(f);
    const onlyServer = middleware().server(g);
    const level = put().use(onlyClient, onlyServer).handle(() => {}).level;
    expect(compose([level], 'client').steps).toEqual([f]);
    expect(compose([level], 'server').steps).toEqual([g]);
  });

  it('an empty middleware() runs on neither side', () => {
    const level = put().use(middleware()).handle(() => {}).level;
    expect(compose([level], 'client').steps).toEqual([]);
    expect(compose([level], 'server').steps).toEqual([]);
  });
});

describe('a middleware is opaque and immutable', () => {
  const f = () => 'f';
  const g = () => 'g';

  it('each half call returns a new middleware', () => {
    const base = middleware();
    const withClient = base.client(f);
    const withBoth = withClient.server(g);
    expect(withClient).not.toBe(base);
    expect(withBoth).not.toBe(withClient);
    expect(halfOf(base, 'client')).toBeUndefined();
    expect(halfOf(withClient, 'client')).toBe(f);
    expect(halfOf(withClient, 'server')).toBeUndefined();
    expect(halfOf(withBoth, 'server')).toBe(g);
  });

  it('writing a half again replaces it, keeping the other', () => {
    const h = () => 'h';
    const mw = middleware().server(g).client(f).client(h);
    expect(halfOf(mw, 'client')).toBe(h);
    expect(halfOf(mw, 'server')).toBe(g);
  });

  it('exposes no client or server field', () => {
    const mw = middleware().client(f).server(g);
    expect((mw as { client?: unknown }).client).not.toBe(f);
    expect((mw as { server?: unknown }).server).not.toBe(g);
  });

  it('a plain function is its own half on both sides', () => {
    expect(halfOf(f, 'client')).toBe(f);
    expect(halfOf(f, 'server')).toBe(f);
  });
});

describe('compress: the innermost level that writes it wins (§3.3)', () => {
  const gz = { format: 'gzip' } as const;
  const raw = { format: 'deflate-raw', min: 1000 } as const;

  it('nobody writes it: off', () => {
    expect(compose([levelOfChain(chain()), put().handle(() => {}).level], 'client').compression).toBe(false);
  });

  it('global writes it and nobody else does: the global one', () => {
    const levels = [levelOfChain(chain().compress(raw)), levelOfChain(chain()), put().handle(() => {}).level];
    expect(compose(levels, 'client').compression).toEqual(raw);
  });

  it('a function .compress(false) turns off what it inherited', () => {
    const levels = [levelOfChain(chain().compress(raw)), put().compress(false).handle(() => {}).level];
    expect(compose(levels, 'client').compression).toBe(false);
  });

  it('the file level overrides the global one, the function the file one', () => {
    const global = levelOfChain(chain().compress(raw));
    const file = levelOfChain(chain().compress(gz));
    expect(compose([global, file], 'server').compression).toEqual(gz);
    const fn = put().compress(raw).handle(() => {}).level;
    expect(compose([global, file, fn], 'server').compression).toEqual(raw);
  });

  it('only in the function: only it compresses', () => {
    const global = levelOfChain(chain());
    expect(compose([global, put().compress(gz).handle(() => {}).level], 'client').compression).toEqual(gz);
    expect(compose([global, put().handle(() => {}).level], 'client').compression).toBe(false);
  });

  it('compress keeps the steps written before and after it', () => {
    const mw = () => {};
    const level = levelOfChain(chain().use(mw).compress(gz).use(mw));
    expect(level.steps).toHaveLength(2);
    expect(level.compression).toEqual(gz);
    const fnLevel = put().use(mw).compress(gz).use(mw).handle(() => {}).level;
    expect(fnLevel.steps).toHaveLength(2);
    expect(fnLevel.compression).toEqual(gz);
  });
});
