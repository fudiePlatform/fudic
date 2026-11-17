// @vitest-environment happy-dom
/**
 * SDD-86 §3.6, §4.8, criteria 23 and 24 — a prop reflected on the host: an attribute with an
 * expression on the component's own tag.
 *
 *   - the server writes it on the host;
 *   - `h` does not write it again;
 *   - `u` changes it, empties it with `true`, removes it with `false`, `null` or `undefined`,
 *     and writes `0` as "0";
 *   - a host created in the browser from a `@foreach` carries the literal attributes and the
 *     interpolated ones of its identity tag, as the server writes them.
 */
import { describe, expect, it } from 'vitest';
import { browserDom } from '@fudic/dom';
import type { FudicElement } from '@fudic/core';
import { resolveComponents, emitComponentModule, type ComponentGraph } from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { clientFactory, mountAsDsd, serverShadowHtml } from './_harness.js';
import { SsrDom, renderToString } from '@fudic/ssr';

let n = 0;

/** `x-card` reflects its prop `variant`, and a list renders cards from a keyed `@foreach`. */
function graphOf(): { graph: ComponentGraph; card: string; list: string } {
  const card = `reflect-card${n}`;
  const list = `reflect-list${n++}`;
  const files = {
    '/p.fud': `<link rel="component" href="./list.fud">\n<html><head></head><body><${list}></${list}></body></html>\n`,
    '/card.fud': [
      '@code {',
      '  const { variant } = props<{ variant?: unknown }>();',
      '}',
      `<${card} role="group" variant="@variant">`,
      '  <template shadowrootmode="open"><p>card</p></template>',
      `</${card}>`,
      '',
    ].join('\n'),
    '/list.fud': [
      '<link rel="component" href="./card.fud">',
      '@code {',
      "  import { signal } from '@fudic/core';",
      "  const items = signal([{ id: 'a', v: 'highlight' }]);",
      '  function more() { items.set([...items(), { id: String(items().length), v: 0 }]); }',
      '}',
      `<${list}>`,
      '  <template shadowrootmode="open">',
      '    <button @click=@more>+</button>',
      `    @foreach (const it of items()) key (it.id) { <${card} .variant=@it.v></${card}> }`,
      '  </template>',
      `</${list}>`,
      '',
    ].join('\n'),
  };
  return { graph: resolveComponents('/p.fud', memoryIo(files)), card, list };
}

/** The server's HTML of one card host — the host tag itself, attributes included. */
function serverHost(graph: ComponentGraph, tag: string, props: Record<string, unknown>): string {
  const code = emitComponentModule(graph, graph.components.get(tag)!);
  const body = code.replace(/^import[^\n]*\n/gmu, '').replace(/^export\s+/gmu, '') + '\nreturn render;';
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const render = new Function(body)() as (dom: unknown, shadow: unknown, props: unknown) => void;
  const dom = new SsrDom();
  const host = dom.element(tag);
  render(dom, dom.attachShadow(host), props);
  const html = renderToString(host);
  return html.slice(0, html.indexOf('>') + 1);
}

describe('the server writes it on the host (criterion 23)', () => {
  it.each([
    ['highlight', ' variant="highlight"'],
    [0, ' variant="0"'],
    [true, ' variant=""'],
  ])('%s', (value, expected) => {
    const { graph, card } = graphOf();
    const tag = serverHost(graph, card, { variant: value });
    expect(tag).toContain(expected);
    expect(tag).toContain('role="group"');
  });

  it.each([[false], [null], [undefined]])('%s: absent', (value) => {
    const { graph, card } = graphOf();
    expect(serverHost(graph, card, { variant: value })).not.toContain('variant=');
  });
});

describe('h and u (criterion 23)', () => {
  /** A painted card, its host carrying what the server wrote, hydrated. */
  function hydrated(): { host: FudicElement & HTMLElement; writes: string[] } {
    const { graph, card } = graphOf();
    customElements.define(card, clientFactory(graph, card) as unknown as CustomElementConstructor);
    const { host } = mountAsDsd(card, serverShadowHtml(graph, card, { variant: 'highlight' }));
    host.setAttribute('role', 'group');
    host.setAttribute('variant', 'highlight');
    const writes: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const r of records) writes.push(`${r.attributeName}`);
    });
    observer.observe(host, { attributes: true });
    (host as FudicElement).h(['highlight']);
    return { host: host as FudicElement & HTMLElement, writes };
  }

  it('hydrating does not write the attribute again', async () => {
    const { host, writes } = hydrated();
    await Promise.resolve();
    expect(writes).toEqual([]);
    expect(host.getAttribute('variant')).toBe('highlight');
  });

  it("u with 'default' changes it", () => {
    const { host } = hydrated();
    host.u([, , 'default']);
    expect(host.getAttribute('variant')).toBe('default');
  });

  it('u with true leaves it present and empty', () => {
    const { host } = hydrated();
    host.u([, , true]);
    expect(host.getAttribute('variant')).toBe('');
  });

  it.each([[false], [null], [undefined]])('u with %s removes it', (value) => {
    const { host } = hydrated();
    host.u([, , value]);
    expect(host.hasAttribute('variant')).toBe(false);
  });

  it('u with 0 writes "0"', () => {
    const { host } = hydrated();
    host.u([, , 0]);
    expect(host.getAttribute('variant')).toBe('0');
  });

  it('role, a literal of the identity tag, is never touched', () => {
    const { host } = hydrated();
    host.u([, , false]);
    expect(host.getAttribute('role')).toBe('group');
  });
});

describe('created in the browser from a @foreach (criterion 24)', () => {
  it('the host carries role="group" and variant, as the server writes them', () => {
    const { graph, card, list } = graphOf();
    customElements.define(card, clientFactory(graph, card) as unknown as CustomElementConstructor);
    customElements.define(list, clientFactory(graph, list) as unknown as CustomElementConstructor);
    const { host } = mountAsDsd(list, serverShadowHtml(graph, list, {}));
    (host as FudicElement).h([]);
    const shadow = host.shadowRoot!;
    shadow.querySelector('button')!.click();
    const cards = [...shadow.querySelectorAll(card)];
    expect(cards).toHaveLength(2);
    const fresh = cards[1]!;
    expect(fresh.getAttribute('role')).toBe('group');
    expect(fresh.getAttribute('variant')).toBe('0');
  });

  it('created directly with c: the same attributes as the server’s host', () => {
    const { graph, card } = graphOf();
    customElements.define(card, clientFactory(graph, card) as unknown as CustomElementConstructor);
    const el = document.createElement(card) as FudicElement & HTMLElement;
    el.c(['highlight']);
    expect(el.getAttribute('role')).toBe('group');
    expect(el.getAttribute('variant')).toBe('highlight');
    const server = serverHost(graph, card, { variant: 'highlight' });
    const attrs = [...el.attributes].map((a) => `${a.name}="${a.value}"`);
    for (const a of attrs) expect(server).toContain(a);
  });
});

void browserDom;
