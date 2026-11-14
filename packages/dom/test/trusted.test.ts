/**
 * SDD-84 §4.6 — the `fudic` Trusted Types policy: created once, on first use, and only where the
 * browser has Trusted Types; without them the text goes through as it is.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A stand-in for `window.trustedTypes`: what a browser that enforces the directive offers. */
function fakeTrustedTypes(): { createPolicy: ReturnType<typeof vi.fn> } {
  return {
    createPolicy: vi.fn((name: string, rules: { createHTML(text: string): string; createScriptURL(url: string): string }) => ({
      createHTML: (text: string) => ({ policy: name, html: rules.createHTML(text), toString: () => rules.createHTML(text) }),
      createScriptURL: (url: string) => ({ policy: name, url: rules.createScriptURL(url) }),
    })),
  };
}

/** A fresh copy of the module: its policy is state, created once per realm. */
async function freshTrusted(): Promise<typeof import('../src/trusted.js')> {
  vi.resetModules();
  return import('../src/trusted.js');
}

/** The realm, as the policy keeps itself on it. */
function resetRealm(): void {
  delete (globalThis as { trustedTypes?: unknown }).trustedTypes;
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('fudic.trusted-types')];
}

beforeEach(resetRealm);
afterEach(resetRealm);

describe('trustedHtmlOf', () => {
  it('without Trusted Types, the text itself', async () => {
    const { trustedHtmlOf } = await freshTrusted();
    expect(trustedHtmlOf('<b>x</b>')).toBe('<b>x</b>');
  });

  it('with them, a value of the `fudic` policy, which does not sanitize, made by ONE policy', async () => {
    const tt = fakeTrustedTypes();
    (globalThis as { trustedTypes?: unknown }).trustedTypes = tt;
    const { trustedHtmlOf, POLICY_NAME } = await freshTrusted();
    expect(tt.createPolicy).not.toHaveBeenCalled();
    const first = trustedHtmlOf('<img src=x onerror=1>') as unknown as { policy: string; html: string };
    trustedHtmlOf('<i>y</i>');
    expect(first).toMatchObject({ policy: 'fudic', html: '<img src=x onerror=1>' });
    expect(POLICY_NAME).toBe('fudic');
    expect(tt.createPolicy).toHaveBeenCalledTimes(1);
  });

  it('declares what it needs from the page: its name in `trusted-types`', async () => {
    const { TRUSTED_TYPES_NEEDS } = await freshTrusted();
    expect(TRUSTED_TYPES_NEEDS).toEqual([{ loads: 'policy', policy: 'fudic', piece: 'the Trusted Types policy of fudic' }]);
  });

  it('the adapter writes `@raw` through it', async () => {
    const tt = fakeTrustedTypes();
    (globalThis as { trustedTypes?: unknown }).trustedTypes = tt;
    vi.resetModules();
    const { browserDom } = await import('../src/browser.js');
    const { trustedHtml } = await import('../src/html.js');
    const el = document.createElement('div');
    browserDom.setHtml(el, trustedHtml('<em>a</em>'));
    browserDom.setHtml(el, '<em>b</em>');
    expect(el.innerHTML).toBe('&lt;em&gt;b&lt;/em&gt;');
    expect(tt.createPolicy).toHaveBeenCalledTimes(1);
  });
});

describe('trustedScriptUrlOf', () => {
  it('without Trusted Types, the URL itself', async () => {
    const { trustedScriptUrlOf } = await freshTrusted();
    expect(trustedScriptUrlOf('/fudic-sw.js')).toBe('/fudic-sw.js');
  });

  it('with them, a script URL of the same policy: two copies of the module, one createPolicy', async () => {
    const tt = fakeTrustedTypes();
    (globalThis as { trustedTypes?: unknown }).trustedTypes = tt;
    // The boot bundle and the runtime piece each carry a copy; the realm holds the one policy.
    const boot = await freshTrusted();
    const piece = await freshTrusted();
    expect(boot.trustedScriptUrlOf('/fudic-sw.js')).toEqual({ policy: 'fudic', url: '/fudic-sw.js' });
    piece.trustedHtmlOf('<i>x</i>');
    expect(tt.createPolicy).toHaveBeenCalledTimes(1);
  });
});
