/**
 * A gesture served: the hydration it started, one frame, and a gesture that took the page to
 * another document (a link, the redirect of a function), which nothing in the old one serves.
 */

import { describe, expect, it } from 'vitest';
import type { LocatorLike, PageLike } from '../src/browser.js';
import { settled } from '../src/settle.js';

function element(host: { id: string; defined: boolean } | null): LocatorLike {
  return { evaluate: async () => host } as unknown as LocatorLike;
}

function page(behaviour: { waitFor?: () => Promise<void>; frame?: () => Promise<unknown> } = {}): PageLike & { readonly calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async waitFor(_script: unknown, id: unknown) {
      calls.push(`waitFor ${String(id)}`);
      await behaviour.waitFor?.();
    },
    async evaluate() {
      calls.push('frame');
      return behaviour.frame?.();
    },
  } as unknown as PageLike & { readonly calls: string[] };
}

describe('settled', () => {
  it('waits for the hydration a gesture started, then a frame', async () => {
    const p = page();
    await expect(settled(p, element({ id: '3', defined: false }), async () => 'done')).resolves.toBe('done');
    expect(p.calls).toEqual(['waitFor 3', 'frame']);
  });

  it('waits only for a frame on a host already defined, or with no host', async () => {
    const defined = page();
    await settled(defined, element({ id: '3', defined: true }), async () => undefined);
    const none = page();
    await settled(none, element(null), async () => undefined);
    expect([defined.calls, none.calls]).toEqual([['frame'], ['frame']]);
  });

  it('a gesture that navigated is served: the old document goes under the wait', async () => {
    const p = page({
      waitFor: () => Promise.reject(new Error('page.waitForFunction: Execution context was destroyed, most likely because of a navigation')),
    });
    await expect(settled(p, element({ id: '3', defined: false }), async () => 'clicked')).resolves.toBe('clicked');
    const q = page({ frame: () => Promise.reject(new Error('page.evaluate: Execution context was destroyed')) });
    await expect(settled(q, element(null), async () => 'clicked')).resolves.toBe('clicked');
  });

  it('any other failure of the wait is the step’s', async () => {
    const p = page({ waitFor: () => Promise.reject(new Error('page.waitForFunction: Timeout 5000ms exceeded.')) });
    await expect(settled(p, element({ id: '3', defined: false }), async () => undefined)).rejects.toThrow('Timeout 5000ms');
  });
});
