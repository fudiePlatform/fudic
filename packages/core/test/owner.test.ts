/**
 * `owned` — who tears down what a component's `@code` created (SDD-68 §3.5, §4.6).
 *
 * The emit wraps the `@code` in `owned` and pours the list into `$d`. What matters here is
 * WHAT lands in the list: every `effect` created while `fn` runs, nothing created outside,
 * and nested owners keep their own lists.
 */

import { describe, expect, it } from 'vitest';
import { effect, owned, signal } from '../src/index.js';
import { own } from '../src/owner.js';

describe('owned (SDD-68 §3.5)', () => {
  it('returns what fn returned, with an empty list when nothing was created', () => {
    const [result, disposers] = owned(() => 42);
    expect(result).toBe(42);
    expect(disposers).toEqual([]);
  });

  it('collects what is handed to own while fn runs, and nothing outside it', () => {
    const outside = (): void => undefined;
    own(outside); // no owner: a no-op, not an error
    const inside = (): void => undefined;
    const [, disposers] = owned(() => {
      own(inside);
    });
    expect(disposers).toEqual([inside]);
  });

  it('keeps nested owners apart and restores the outer one', () => {
    const a = (): void => undefined;
    const b = (): void => undefined;
    const c = (): void => undefined;
    let inner: readonly (() => void)[] = [];
    const [, outer] = owned(() => {
      own(a);
      [, inner] = owned(() => {
        own(b);
      });
      own(c);
    });
    expect(inner).toEqual([b]);
    expect(outer).toEqual([a, c]);
  });

  it('restores the previous owner when fn throws', () => {
    const late = (): void => undefined;
    const [, outer] = owned(() => {
      expect(() =>
        owned(() => {
          throw new Error('boom');
        }),
      ).toThrow('boom');
      own(late);
    });
    expect(outer).toEqual([late]);
    // And after everything, there is no owner left behind.
    const [, after] = owned(() => undefined);
    expect(after).toEqual([]);
  });
});

describe('effect with an owner (SDD-68 §4.6)', () => {
  it('an effect created inside owned is torn down by its disposer, cleanup included', () => {
    const a = signal(1);
    const seen: number[] = [];
    let cleanups = 0;
    const [, disposers] = owned(() => {
      effect(() => {
        seen.push(a());
        return () => {
          cleanups += 1;
        };
      });
    });
    expect(disposers).toHaveLength(1);
    a.set(2);
    expect(seen).toEqual([1, 2]);
    for (const dispose of disposers) dispose();
    expect(cleanups).toBe(2);
    a.set(3);
    expect(seen).toEqual([1, 2]);
  });

  it('an effect created outside owned lands in no list and lives on', () => {
    const a = signal(1);
    const seen: number[] = [];
    const [, disposers] = owned(() => undefined);
    const dispose = effect(() => {
      seen.push(a());
    });
    for (const d of disposers) d();
    a.set(2);
    expect(seen).toEqual([1, 2]);
    dispose();
  });

  it('an effect created by a later rerun has no owner', () => {
    const trigger = signal(0);
    const inner = signal('x');
    const seen: string[] = [];
    const [, disposers] = owned(() => {
      effect(() => {
        if (trigger() === 1) {
          effect(() => {
            seen.push(inner());
          });
        }
      });
    });
    expect(disposers).toHaveLength(1);
    trigger.set(1); // the rerun runs outside owned
    expect(disposers).toHaveLength(1);
    for (const d of disposers) d();
    inner.set('y');
    expect(seen).toEqual(['x', 'y']);
  });
});
