/**
 * SDD-33 §6.11 — an overtaken validation never publishes.
 *
 * The latency is controlled from the test and the OLD validation is resolved
 * FIRST, which is the order a remote rule produces on a slow request. Without the
 * epoch this test fails, and what the user sees in production is the error of what
 * they typed three letters ago.
 */

import { describe, expect, it } from 'vitest';
import { control } from '../src/control.js';
import { form } from '../src/form.js';
import type { Validator } from '../src/types.js';

/**
 * Lets every pending microtask run. A control's rule is invoked synchronously
 * inside `$validate()`, but a form-level one is only reached after its children
 * have been awaited, so the test has to get out of the way first.
 */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** A rule whose resolution is handed back to the test, one deferred per value. */
function gated() {
  const pending = new Map<string, () => void>();
  const rule: Validator<string> = (v) =>
    new Promise((resolve) => {
      pending.set(v, () => {
        resolve(v === 'taken' ? { taken: true } : null);
      });
    });
  return {
    rule,
    resolve(value: string) {
      const go = pending.get(value);
      if (go === undefined) {
        throw new Error(`nothing pending for "${value}"`);
      }
      go();
    },
  };
}

describe('the epoch', () => {
  it('drops the result of a value that has already moved', async () => {
    const { rule, resolve } = gated();
    const f = form({ slug: control('', [rule]) });

    f.slug.set('taken');
    const first = f.$validate();

    f.slug.set('free');
    const second = f.$validate();

    // The slow one comes back first, and it is the one that must not publish.
    resolve('taken');
    resolve('free');
    await Promise.all([first, second]);

    expect(f.slug.errors()).toBeNull();
    expect(f.$errors()).toBeNull();
  });

  it('publishes when the value did not move', async () => {
    const { rule, resolve } = gated();
    const f = form({ slug: control('', [rule]) });

    f.slug.set('taken');
    const run = f.$validate();
    resolve('taken');

    expect(await run).toBe(false);
    expect(f.slug.errors()).toEqual({ taken: true });
  });

  it('a reset while a validation is in flight also drops it', async () => {
    const { rule, resolve } = gated();
    const f = form({ slug: control('', [rule]) });

    f.slug.set('taken');
    const run = f.$validate();
    f.slug.reset();
    resolve('taken');
    await run;

    expect(f.slug.errors()).toBeNull();
  });

  it('a form-level summary that has been overtaken does not publish either', async () => {
    const gates: (() => void)[] = [];
    const f = form(
      { a: control(1) },
      {
        summary: () =>
          new Promise<{ n: number } | null>((resolve) => {
            const n = gates.length + 1;
            gates.push(() => {
              resolve({ n });
            });
          }),
      },
    );

    const first = f.$validate();
    const second = f.$validate();
    await tick();

    expect(gates).toHaveLength(2);
    // Both resolve, oldest first; only the second pass may publish.
    gates[0]?.();
    gates[1]?.();
    await Promise.all([first, second]);

    expect(f.$summary()).toEqual({ n: 2 });
  });
});
