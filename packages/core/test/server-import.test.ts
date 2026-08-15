/**
 * @vitest-environment node
 *
 * The entry point has to be importable where there is NO DOM.
 *
 * `strategy` is server-side by definition — a route declares it inside `@server` — and it is
 * exported from the same module as `FudicElement`, whose `extends HTMLElement` is evaluated
 * when the module is. On a server that threw before anything could use it, and it took the
 * whole of `@fudic/core` down: every route with `import { strategy } from '@fudic/core'`
 * failed to render.
 *
 * A production build never showed it, because Rollup drops a class the server render does
 * not mention. This file runs in `node`, where there is no bundler and no `HTMLElement`,
 * which is exactly the shape of the dev server that did show it.
 */
import { describe, expect, it } from 'vitest';

describe('@fudic/core on a server', () => {
  it('imports with no DOM at all', async () => {
    expect(globalThis.HTMLElement).toBeUndefined();
    const core = await import('../src/index.js');
    expect(typeof core.strategy).toBe('function');
    expect(typeof core.signal).toBe('function');
  });

  it('carries the element class, inert and unregistrable', async () => {
    const { FudicElement } = await import('../src/index.js');
    // It exists, which is the whole requirement: a class nobody can register, because
    // `customElements` is not there either. Its entry points are unreachable by
    // construction — the runtime that would call them is the browser's.
    expect(typeof FudicElement).toBe('function');
    expect(globalThis.customElements).toBeUndefined();
  });

  it('declares a strategy without touching the DOM', async () => {
    const { strategy } = await import('../src/index.js');
    // It returns nothing on purpose — the build READS the call, it never runs it. What is
    // under test is that calling it here does not throw, which is what a route does.
    expect(strategy({ mode: 'ssg' })).toBeUndefined();
  });
});
