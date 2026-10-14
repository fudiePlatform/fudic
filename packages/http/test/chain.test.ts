/**
 * SDD-56 §6 criteria 1–5: how a chain is put together and how it runs.
 *
 * The chain is read from the builders as the compiler and `dispatch` read it — `levelOfChain`
 * for `chain()`, `.level` for a function — and folded by `compose` from the outside in.
 */

import { describe, expect, it } from 'vitest';
import { chain, levelOfChain } from '../src/chain.js';
import { compose, run } from '../src/compose.js';
import { del, get, patch, post, put } from '../src/builder.js';
import { notFound, HttpError } from '../src/errors.js';
import type { Level } from '../src/step.js';
import { serverCtx, tracer } from './helpers.js';

const trace: string[] = [];
const a = tracer(trace, 'a');
const b = tracer(trace, 'b');
const log = tracer(trace, 'log');
const auth = tracer(trace, 'auth');
const apiKey = tracer(trace, 'apiKey');
const audit = tracer(trace, 'audit');

/** The steps of the server side, as the identities they came from. */
const server = (levels: readonly Level[]) => compose(levels, 'server').steps;

describe('criterion 1: the order is the order written', () => {
  it('get().use(a).use(b).handle(f) is a → b → f', async () => {
    trace.length = 0;
    const fn = get().use(a).use(b).handle(() => 'f');
    expect(server([fn.level])).toEqual([a, b]);
    expect(await run(server([fn.level]), serverCtx('GET'), fn.handle)).toBe('f');
    expect(trace).toEqual(['a', 'b']);
  });

  it('chain().use(a, b) equals chain().use(a).use(b)', () => {
    const one = server([levelOfChain(chain().use(a, b))]);
    const two = server([levelOfChain(chain().use(a).use(b))]);
    expect(one).toEqual([a, b]);
    expect(two).toEqual(one);
  });

  it('a function .use(a, b) in one call keeps the order too', () => {
    expect(server([put().use(a, b).handle(() => {}).level])).toEqual([a, b]);
  });
});

describe('criterion 2: three levels, outside in', () => {
  const global = levelOfChain(chain().use(log, auth));
  const file = levelOfChain(chain().skip(auth).use(apiKey));

  it('global use(log, auth), file skip(auth).use(apiKey), function use(audit)', () => {
    const save = put().use(audit).handle(() => {});
    expect(server([global, file, save.level])).toEqual([log, apiKey, audit]);
  });

  it('load, with nothing of its own, is log → apiKey', () => {
    expect(server([global, file])).toEqual([log, apiKey]);
  });

  it("a function skip('*') leaves it empty", () => {
    const search = get().skip('*').handle(() => {});
    expect(server([global, file, search.level])).toEqual([]);
  });

  it("skip('*') only removes what came before it", () => {
    const fn = get().skip('*').use(audit).handle(() => {});
    expect(server([global, file, fn.level])).toEqual([audit]);
  });

  it("a file skip('*') clears the global level", () => {
    const own = levelOfChain(chain().skip('*').use(apiKey));
    expect(server([global, own])).toEqual([apiKey]);
  });

  it('with no level at all there is nothing', () => {
    expect(compose([], 'server')).toEqual({ steps: [], compression: false });
  });
});

describe('criterion 3: skipping what was never there', () => {
  it('leaves the chain as it was', () => {
    const global = levelOfChain(chain().use(log));
    const fn = put().skip(audit).handle(() => {});
    expect(server([global, fn.level])).toEqual([log]);
  });

  it('skips by identity, not by shape', () => {
    const twin = tracer(trace, 'log');
    const global = levelOfChain(chain().use(log));
    expect(server([global, levelOfChain(chain().skip(twin))])).toEqual([log]);
  });
});

describe('criterion 4: a builder kept and continued twice', () => {
  it('gives two independent functions', () => {
    const secured = put().use(auth);
    const save = secured.use(audit).invalidates('/a').handle(() => 'save');
    const rename = secured.use(apiKey).compress(false).handle(() => 'rename');

    expect(server([save.level])).toEqual([auth, audit]);
    expect(server([rename.level])).toEqual([auth, apiKey]);
    expect(save.invalidates).toEqual(['/a']);
    expect(rename.invalidates).toEqual([]);
    expect(save.level.compression).toBeUndefined();
    expect(rename.level.compression).toBe(false);
    expect(server([secured.handle(() => {}).level])).toEqual([auth]);
  });

  it('a chain kept and continued twice does not leak either', () => {
    const base = chain().use(log);
    const one = base.use(auth);
    const two = base.compress({ format: 'gzip' });
    expect(server([levelOfChain(one)])).toEqual([log, auth]);
    expect(server([levelOfChain(two)])).toEqual([log]);
    expect(levelOfChain(base)).toEqual({ steps: [{ kind: 'use', mws: [log] }] });
  });
});

describe('criterion 5: next', () => {
  it('returns the value of handle', async () => {
    let seen: unknown;
    const peek = async (ctx: never, next: (c: never) => Promise<unknown>) => {
      seen = await next(ctx);
      return seen;
    };
    expect(await run([peek], serverCtx(), () => 42)).toBe(42);
    expect(seen).toBe(42);
  });

  it('carries an async handle value through every step', async () => {
    const fn = put().use(a, b).handle(async () => ({ ok: 1 }));
    expect(await run(server([fn.level]), serverCtx(), fn.handle)).toEqual({ ok: 1 });
  });

  it('a try/catch around next catches a notFound thrown in handle', async () => {
    let caught: unknown;
    const guard = async (ctx: never, next: (c: never) => Promise<unknown>) => {
      try {
        return await next(ctx);
      } catch (e) {
        caught = e;
        return 'recovered';
      }
    };
    const value = await run([guard], serverCtx(), () => {
      throw notFound('x');
    });
    expect(value).toBe('recovered');
    expect(caught).toBeInstanceOf(HttpError);
    expect((caught as HttpError).status).toBe(404);
  });

  it('an error nobody catches rejects the run', async () => {
    await expect(run([a], serverCtx(), () => { throw notFound(); })).rejects.toMatchObject({ status: 404 });
  });

  it('calling next twice runs handle twice', async () => {
    let calls = 0;
    const twice = async (ctx: never, next: (c: never) => Promise<unknown>) => {
      await next(ctx);
      return next(ctx);
    };
    expect(await run([twice], serverCtx(), () => ++calls)).toBe(2);
    expect(calls).toBe(2);
  });

  it('next passes the ctx it is given to the inside', async () => {
    const swap = (_: never, next: (c: unknown) => Promise<unknown>) => next('inner');
    expect(await run([swap as never], 'outer', (c) => c)).toBe('inner');
  });
});

describe('the verbs', () => {
  it.each([
    [get, 'GET'],
    [post, 'POST'],
    [put, 'PUT'],
    [patch, 'PATCH'],
    [del, 'DELETE'],
  ] as const)('%#: opens with its method', (verb, method) => {
    const fn = verb().handle(() => {});
    expect(fn.method).toBe(method);
    expect(fn.level).toEqual({ steps: [] });
    expect(fn.invalidates).toEqual([]);
    expect('form' in fn).toBe(false);
  });

  it('.args() changes nothing at runtime', () => {
    const fn = get().args<{ q: string }>().handle(() => {});
    expect(fn.level).toEqual({ steps: [] });
  });

  it('.invalidates accumulates, in order', () => {
    const fn = put().invalidates('/a').invalidates('/b/:slug', '/c').handle(() => {});
    expect(fn.invalidates).toEqual(['/a', '/b/:slug', '/c']);
  });

  it('.handle keeps the function it was given', () => {
    const h = () => 1;
    expect(get().handle(h).handle).toBe(h);
  });
});
