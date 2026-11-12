import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, injectFrom, token } from '@fudic/di';
import { benchRoot } from '../src/index.js';

const KEY = Symbol.for('fudic.bench');
const Clock = token<string>('clock');
const request = (cookie: string): Request => new Request('http://x/', { headers: { 'x-bench': cookie } });

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[KEY];
});

describe('benchRoot (SDD-82 §4.2)', () => {
  it('leaves the root alone without hooks', () => {
    const root = createRoot();
    expect(benchRoot(root, request('fudic-bench=a'))).toBe(root);
  });

  it('puts the criterion services in the root of a request that carries one', () => {
    (globalThis as Record<symbol, unknown>)[KEY] = {
      criterionOf: (r: Request) => (r.headers.get('x-bench') === 'c=1' ? 'run.uno' : undefined),
      services: (c: string) => [{ provide: Clock, use: () => c }],
    };
    expect(injectFrom(benchRoot(createRoot(), request('c=1')), Clock)).toBe('run.uno');
    // No criterion, or no request: nothing is put.
    const bare = benchRoot(createRoot(), request('c=2'));
    expect(() => injectFrom(bare, Clock)).toThrow();
    expect(() => injectFrom(benchRoot(createRoot(), undefined), Clock)).toThrow();
  });
});
