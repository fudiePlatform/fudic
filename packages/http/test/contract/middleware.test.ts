/**
 * SDD-60 §3.5, §3.8 — a middleware of a `.fudapi`: a slot per declared half, filled from its
 * folder, and the chain folded global → file → function with `use`, `skip` and `compress`.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { compose, loadingFile, middleware, resetRegistry, use, type Level } from '../../src/contract/index.js';
import { run } from '../../src/compose.js';
import { clientCtx, serverCtx } from '../helpers.js';

afterEach(() => {
  loadingFile(undefined);
  resetRegistry();
});

/** A step that writes `name` and its params, then goes on. */
const tracing =
  (trace: string[], name: string) =>
  (ctx: unknown, next: (c: unknown) => unknown, params: object): unknown => {
    trace.push(`${name}${JSON.stringify(params)}`);
    return next(ctx);
  };

/** Runs the composed steps into a handler that answers `done`. */
const runAll = (steps: readonly unknown[], ctx: unknown): Promise<unknown> =>
  run(steps as never, ctx as never, async () => 'done');

describe('the piece', () => {
  it('has a slot per declared half and refuses a half it does not declare', () => {
    const log = middleware({ id: 'middlewares/log', name: 'log', client: true });
    expect(log.name).toBe('log');
    expect(() => log.server(() => undefined)).toThrow('log of middlewares/log has no server half');
    const auth = middleware({ id: 'middlewares/auth', name: 'auth', server: true });
    expect(() => auth.client(() => undefined)).toThrow('auth of middlewares/auth has no client half');
  });

  it('each half belongs in its folder', () => {
    const csrf = middleware({ id: '@fudic/http/middlewares', name: 'csrf', client: true, server: true });
    loadingFile('server', 'src/server/csrf.ts');
    expect(() => csrf.client(() => undefined)).toThrow(
      'the client half of csrf of @fudic/http/middlewares must be implemented in src/browser: src/server/csrf.ts',
    );
    loadingFile('browser', 'src/browser/csrf.ts');
    expect(() => csrf.server(() => undefined)).toThrow(
      'the server half of csrf of @fudic/http/middlewares must be implemented in src/server: src/browser/csrf.ts',
    );
  });

  it('the browser variant can never have its server half', () => {
    const auth = middleware({ id: 'middlewares/auth', name: 'auth', server: true, browser: true });
    expect(() => auth.server(() => undefined)).toThrow('the server half of auth of middlewares/auth must be implemented in src/server');
  });
});

describe('compose', () => {
  it('runs the halves of one side in order, with the params of each use', async () => {
    const trace: string[] = [];
    const a = middleware<{ n: number }>({ id: 'm', name: 'a', client: true, server: true });
    const b = middleware({ id: 'm', name: 'b', server: true });
    a.client(tracing(trace, 'a.client') as never);
    a.server(tracing(trace, 'a.server') as never);
    b.server(tracing(trace, 'b.server') as never);
    const levels: Level[] = [{ steps: [{ use: [use(a, { n: 1 }), use(b)] }] }];

    expect(await runAll(compose(levels, 'server').steps, serverCtx())).toBe('done');
    expect(await runAll(compose(levels, 'client').steps, clientCtx())).toBe('done');
    expect(trace).toEqual(['a.server{"n":1}', 'b.server{}', 'a.client{"n":1}']);
  });

  it('folds the levels from the outside in: uses accumulate, skip removes, skip * empties', () => {
    const [a, b, c] = ['a', 'b', 'c'].map((name) => middleware({ id: 'm', name, server: true }));
    const names = (levels: Level[]) => compose(levels, 'server').steps.length;
    expect(names([{ steps: [{ use: [use(a!)] }] }, { steps: [{ use: [use(b!)] }] }, { steps: [{ use: [use(c!)] }] }])).toBe(3);
    expect(names([{ steps: [{ use: [use(a!), use(b!)] }] }, { steps: [{ skip: [a!] }] }])).toBe(1);
    expect(names([{ steps: [{ use: [use(a!), use(b!)] }] }, { steps: [{ skip: '*' }, { use: [use(c!)] }] }])).toBe(1);
  });

  it('skip removes the right one', async () => {
    const trace: string[] = [];
    const [a, b] = ['a', 'b'].map((name) => middleware({ id: 'm', name, server: true }));
    a!.server(tracing(trace, 'a') as never);
    b!.server(tracing(trace, 'b') as never);
    await runAll(compose([{ steps: [{ use: [use(a!), use(b!)] }] }, { steps: [{ skip: [a!] }] }], 'server').steps, serverCtx());
    expect(trace).toEqual(['b{}']);
  });

  it('compress: the innermost level that writes it wins; off is false; none is false', () => {
    expect(compose([], 'server').compression).toBe(false);
    expect(compose([{ steps: [], compress: { format: 'gzip', min: 200 } }], 'client').compression).toEqual({ format: 'gzip', min: 200 });
    expect(compose([{ steps: [], compress: { format: 'gzip' } }, { steps: [], compress: false }], 'client').compression).toBe(false);
    expect(compose([{ steps: [], compress: { format: 'gzip' } }, { steps: [] }], 'client').compression).toEqual({ format: 'gzip' });
  });

  it('a declared half nobody implemented fails the call: a missing auth never lets it through', async () => {
    const auth = middleware({ id: 'middlewares/auth', name: 'auth', server: true });
    const { steps } = compose([{ steps: [{ use: [use(auth)] }] }], 'server');
    await expect(runAll(steps, serverCtx())).rejects.toThrow('the server half of auth of middlewares/auth has no implementation in src/server');
  });

  it('the implementation is read when the step runs, not when it is composed', async () => {
    const trace: string[] = [];
    const late = middleware({ id: 'm', name: 'late', client: true });
    const { steps } = compose([{ steps: [{ use: [use(late)] }] }], 'client');
    late.client(tracing(trace, 'late') as never);
    await runAll(steps, clientCtx());
    expect(trace).toEqual(['late{}']);
  });
});
