/**
 * The templates a piece of view is created from: only a literal with no holes gets in, it is
 * parsed on the first clone and through the `fudic` policy, and a piece inside `<svg>` or
 * `<math>` comes out in its namespace without its wrapper.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NS } from '../src/ns.js';
import type { Template } from '../src/template.js';

/** A fresh copy of the modules: the policy is state, created once per realm. */
async function fresh(): Promise<typeof import('../src/template.js')> {
  vi.resetModules();
  return import('../src/template.js');
}

/** A stand-in for `window.trustedTypes` that counts what it is asked to make. */
function fakeTrustedTypes(): { createPolicy: ReturnType<typeof vi.fn>; created: string[] } {
  const created: string[] = [];
  return {
    created,
    createPolicy: vi.fn((name: string, rules: { createHTML(text: string): string }) => ({
      createHTML: (text: string) => {
        created.push(text);
        return { policy: name, toString: () => rules.createHTML(text) };
      },
      createScriptURL: (url: string) => url,
    })),
  };
}

function resetRealm(): void {
  delete (globalThis as { trustedTypes?: unknown }).trustedTypes;
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('fudic.trusted-types')];
}

beforeEach(resetRealm);
afterEach(resetRealm);

/** The HTML of a clone, to compare what came out. */
const htmlOf = (fragment: DocumentFragment): string => {
  const holder = document.createElement('div');
  holder.append(fragment);
  return holder.innerHTML;
};

describe('template — only a literal with no holes', () => {
  it('a string is a TypeError, even one character long', async () => {
    const { template } = await fresh();
    const call = template as (strings: unknown) => Template;
    expect(() => call('<p>x</p>')).toThrow(TypeError);
    expect(() => call('x')).toThrow(TypeError);
  });

  it('an array that is not frozen, or frozen without its `raw`, is a TypeError', async () => {
    const { template } = await fresh();
    const call = template as (strings: unknown) => Template;
    expect(() => call(['<p>x</p>'])).toThrow(TypeError);
    expect(() => call(Object.freeze(['<p>x</p>']))).toThrow(TypeError);
  });

  it('a literal with holes is a TypeError: a value never goes into a template', async () => {
    const { template } = await fresh();
    const call = template as (strings: TemplateStringsArray, ...values: unknown[]) => Template;
    expect(() => call`<p>${'x'}</p>`).toThrow(TypeError);
  });

  it('a literal with an escape that does not cook is a TypeError: there is no text to parse', async () => {
    const { template } = await fresh();
    expect(() => template`\unicode`).toThrow(TypeError);
  });
});

describe('template — parsed once, cloned every time', () => {
  it('each call hands out a fresh deep clone of the literal', async () => {
    const { template } = await fresh();
    const t = template`<p class="a">Hola <b>x</b></p><!--fud-->`;
    const first = t();
    (first.firstChild as Element).setAttribute('class', 'cambiado');
    expect(htmlOf(first)).toBe('<p class="cambiado">Hola <b>x</b></p><!--fud-->');
    expect(htmlOf(t())).toBe('<p class="a">Hola <b>x</b></p><!--fud-->');
  });

  it('a text with a backtick, a `${` and a backslash comes out as written', async () => {
    const { template } = await fresh();
    expect(htmlOf(template`<p>a \` b \${c} \\d</p>`())).toBe('<p>a ` b ${c} \\d</p>');
  });

  it('without Trusted Types, it parses all the same', async () => {
    const { template } = await fresh();
    expect(htmlOf(template`<i>x</i>`())).toBe('<i>x</i>');
  });
});

describe('template — through the `fudic` policy, and only when it clones', () => {
  it('making a template creates no policy; the first clone does, and parses once', async () => {
    const tt = fakeTrustedTypes();
    (globalThis as { trustedTypes?: unknown }).trustedTypes = tt;
    const { template } = await fresh();
    const a = template`<i>a</i>`;
    const b = template`<b>b</b>`;
    expect(tt.createPolicy).not.toHaveBeenCalled();
    a();
    a();
    b();
    expect(tt.createPolicy).toHaveBeenCalledTimes(1);
    expect(tt.createPolicy.mock.calls[0]![0]).toBe('fudic');
    expect(tt.created).toEqual(['<i>a</i>', '<b>b</b>']);
  });
});

describe('templateIn — a piece inside <svg> or <math>', () => {
  it('creates the children in the SVG namespace, without the wrapper', async () => {
    const { templateIn } = await fresh();
    const fragment = templateIn`<svg><circle r="1"></circle><g><text>a</text></g></svg>`();
    const [circle, g] = [...fragment.children];
    expect(fragment.children).toHaveLength(2);
    expect(circle!.localName).toBe('circle');
    expect(circle!.namespaceURI).toBe(NS.svg);
    expect(g!.firstElementChild!.namespaceURI).toBe(NS.svg);
  });

  // happy-dom parses `<math>` as HTML, so the namespace is checked in a real browser (e2e); here,
  // that the wrapper goes and its children stay.
  it('hands out the children of a <math> wrapper, without it', async () => {
    const { templateIn } = await fresh();
    const fragment = templateIn`<math><mi>x</mi><mo>+</mo></math>`();
    expect([...fragment.children].map((el) => el.localName)).toEqual(['mi', 'mo']);
  });

  it('is exported from the package entry, with `template`', async () => {
    vi.resetModules();
    const api = await import('../src/index.js');
    const own = await import('../src/template.js');
    expect(api.template).toBe(own.template);
    expect(api.templateIn).toBe(own.templateIn);
  });
});
