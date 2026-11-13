/**
 * @vitest-environment happy-dom
 *
 * SDD-84 §4.6, criterion 29 — the summary is painted through the `fudic` Trusted Types policy of
 * `@fudic/dom`, the same one an `@raw` goes through: on a page with both, one policy.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  delete (globalThis as { trustedTypes?: unknown }).trustedTypes;
});

describe('the summary under Trusted Types (criterion 29)', () => {
  it('paints through the `fudic` policy, created once for it and for `@raw`', async () => {
    const created: string[] = [];
    const painted: string[] = [];
    (globalThis as { trustedTypes?: unknown }).trustedTypes = {
      createPolicy: (name: string, rules: { createHTML(text: string): string }) => {
        created.push(name);
        return {
          createHTML: (text: string) => {
            painted.push(text);
            return rules.createHTML(text);
          },
        };
      },
    };
    // Fresh copies: the policy is state, made once per realm.
    vi.resetModules();
    const { browserDom } = await import('@fudic/dom');
    const { bindForm } = await import('../../src/dom/bind-form.js');
    const { control, form, required } = await import('../../src/contract/index.js');

    document.body.innerHTML = '<form><div id="sum"></div></form><p id="raw"></p>';
    const f = form({ name: control('', [required]) }, { summary: (r) => (r.name() === 'x' ? { taken: true } : null) });
    bindForm(document.querySelector('form')!, f, document.querySelector<HTMLElement>('#sum'), null);
    f.name.set('x');
    await f.$validate();
    browserDom.setHtml(document.querySelector('#raw')!, 'a < b');

    expect(document.querySelector('#sum')!.innerHTML).toBe('<ul><li>taken</li></ul>');
    expect(painted).toEqual(['<ul><li>taken</li></ul>', 'a &lt; b']);
    expect(created).toEqual(['fudic']);
  });
});
