// @vitest-environment happy-dom
/**
 * SDD-15 §6.7 — equivalence of create and hydrate, converging on `s`.
 *
 * `c()` fabricates, mounts and hooks up; `h()` adopts and hooks up. They differ ONLY in how
 * they get their node references, so the tree they end up holding has to be the same one.
 * Both are driven here over a real DOM, with the same props, and compared against the
 * markup the server painted from those same props.
 *
 * The reference is the server markup AS THE PARSER LEAVES IT — nested
 * `<template shadowrootmode>` already consumed into shadow roots. A descendant's shadow is
 * not part of this component's tree: the server fills it in one pass because it renders the
 * whole page, the client leaves it to the runtime (SDD-17). `innerHTML` does not serialize
 * a shadow root, so both sides are compared on exactly the nodes both sides own.
 */

import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { browserDom } from '@fudic/dom';
import { resolveComponents, type ComponentGraph } from '../../../src/emit/index.js';
import { fixturesDir, fixtureIo, memoryIo } from '../_support.js';
import { clientFactory, controller, mountAsDsd, serverShadowHtml } from './_harness.js';

const graph: ComponentGraph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);

/** The server's markup, mounted as the parser would leave it. */
function painted(tag: string, props: unknown, g: ComponentGraph = graph): { shadow: ShadowRoot; html: string } {
  const { shadow } = mountAsDsd(tag, serverShadowHtml(g, tag, props));
  return { shadow, html: shadow.innerHTML };
}

/**
 * The one attribute the two branches are MEANT to disagree on.
 *
 * `data-fud-id` is identity of PAGE (SDD-15 §3.1): the server assigns it while rendering,
 * because only the page knows how many instances there are and in what order. An instance
 * created at runtime by its parent controller has no entry in the payload and no id — its
 * props are injected, not sliced (§4.3). So a host the server painted carries it and the
 * same host built by `c()` does not, and that is the contract rather than a drift.
 */
const withoutIds = (html: string): string => html.replace(/ data-fud-id="\d+"/gu, '');

/** The tree `c()` builds, as HTML — a fresh host, nothing adopted. */
function created(tag: string, values: readonly unknown[], g: ComponentGraph = graph): string {
  const host = document.createElement(tag);
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  controller(clientFactory(g, tag), browserDom, shadow, values).c();
  return shadow.innerHTML;
}

/** The tree `h()` holds, as HTML — adopted from the server's. */
function hydrated(tag: string, props: unknown, values: readonly unknown[], g: ComponentGraph = graph): string {
  const { shadow } = painted(tag, props, g);
  controller(clientFactory(g, tag), browserDom, shadow, values).h();
  return shadow.innerHTML;
}

describe('create ↔ hydrate — a leaf component (app-badge)', () => {
  const { html } = painted('app-badge', { tone: 'success' });

  it('c() builds exactly what the server painted', () => {
    expect(created('app-badge', ['success'])).toBe(html);
  });

  it('h() leaves it untouched', () => {
    expect(hydrated('app-badge', { tone: 'success' }, ['success'])).toBe(html);
  });

  it('applies the same prop default on both sides when the value is missing', () => {
    // `tone = 'neutral'`: the server takes it from `props ?? {}`, the client from the
    // positional destructuring of `$props`. One AST, two extremes — they must agree.
    const bare = painted('app-badge', {}).html;
    expect(created('app-badge', [undefined])).toBe(bare);
    expect(bare).toContain('class="badge"');
  });
});

describe('create ↔ hydrate — composition and control flow (app-card)', () => {
  const props = { title: 'Hola', variant: 'highlight' };
  const values = ['Hola', 'highlight'] as const; // title, variant — the positional payload
  const { html } = painted('app-card', props);

  it('c() builds exactly what the server painted, but for the page identity', () => {
    const built = created('app-card', values);
    expect(built).toBe(withoutIds(html));
    // The child host is there, with its style specifier — and empty on both sides: opening
    // its shadow and driving it belongs to the runtime, not to the parent.
    expect(built).toContain('<app-button data-adopt="app-button" variant="ghost">');
    // And the difference is exactly that one attribute, on the hydratable host only.
    expect(html).toContain('<app-button data-fud-id="0" data-adopt="app-button"');
  });

  it('h() leaves it untouched', () => {
    expect(hydrated('app-card', props, values)).toBe(html);
  });

  it('takes the same @if branch on both paths, from the same initial state', () => {
    // `expanded` starts false on both sides: the server renders the inert signal's initial
    // value, the client's real `signal(false)` reads the same. So `.body` is absent and the
    // button says "Abrir" in both — and if it were not so, the two trees would differ by a
    // whole subtree and the comparison above would already have failed.
    expect(html).not.toContain('class="body"');
    expect(html).toContain('Abrir');
    expect(html).not.toContain('Cerrar');
  });

  it('interpolates the same text node in both paths', () => {
    expect(html).toContain('<h2>Hola</h2>');
    expect(created('app-card', ['Otro', 'default'])).toContain('<h2>Otro</h2>');
  });

  it('composes class from the base plus the binding, identically', () => {
    expect(html).toContain('class="card highlight"');
    expect(created('app-card', ['Hola', 'default'])).toContain('class="card"');
  });
});

/**
 * BUG-14 §6.5 — the two escapes, over the same comparison.
 *
 * This is the case that decided the design and it belongs HERE, not in a text assertion:
 * the server writes HTML and the client writes `textContent`, and `textContent` does not
 * interpret entities. With the data left verbatim the two paths would paint different
 * characters from one template, and no amount of reading either branch would show it —
 * only running both and comparing does.
 */
describe('create ↔ hydrate — `@@` and an entity (§6.5)', () => {
  const literals: ComponentGraph = resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud':
        '<link rel="component" href="./doc-escape.fud">\n' +
        '<html><head></head><body><doc-escape></doc-escape></body></html>\n',
      '/doc-escape.fud': `<head>
  <style>:host { display: block; }</style>
</head>

<doc-escape>
  <template shadowrootmode="open">
    <code>@@server load</code>
    <code>&lt;html&gt;</code>
  </template>
</doc-escape>
`,
    }),
  );
  const { html } = painted('doc-escape', {}, literals);

  it('the server paints the characters the author meant', () => {
    expect(html).toContain('<code>@server load</code>');
    expect(html).toContain('<code>&lt;html&gt;</code>');
  });

  it('c() builds exactly what the server painted', () => {
    expect(created('doc-escape', [], literals)).toBe(html);
  });

  it('h() leaves it untouched', () => {
    expect(hydrated('doc-escape', {}, [], literals)).toBe(html);
  });
});
