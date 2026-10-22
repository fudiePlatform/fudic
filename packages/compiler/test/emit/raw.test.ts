// @vitest-environment happy-dom
/**
 * `@raw(expr)` (decision 18) — the element it owns is written as HTML, on both sides.
 *
 * The text nets check the codegen's choices: the server writes `setHtml` INSTEAD of the
 * children, the client turns it into one value write in `$a`, and `h` adopts the element
 * without entering it. The run nets check what those choices are for: the tree the server
 * painted is the tree the client adopts, a signal rewrites the content and nothing around it,
 * and an unmarked string is text on both sides.
 */

import { describe, expect, it } from 'vitest';
import { browserDom } from '@fudic/dom';
import {
  resolveComponents,
  emitComponentClientModuleMapped,
  emitComponentModule,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { memoryIo } from './_support.js';
import { clientFactory, controller, mountAsDsd, serverShadowHtml } from './hydrate/_harness.js';

/**
 * The marks are built by hand: the harness strips imports, and `isTrustedHtml` recognises the
 * mark by its GLOBAL symbol — which is exactly what lets two copies of `@fudic/dom` agree.
 */
const CODE =
  '@code {\n' +
  "  import { signal } from '@fudic/core';\n" +
  "  const mark = (s) => ({ [Symbol.for('fudic.trustedHtml')]: s, fudicTrustedHtml: s });\n" +
  "  const uno = mark('<h3>Primer post</h3><p>Con <em>énfasis</em>.</p>');\n" +
  "  const dos = mark('<h3>Segundo post</h3><ul><li>uno</li><li>dos</li></ul>');\n" +
  "  const falsa = '<b>esto no está marcado</b>';\n" +
  '  const post = signal(uno);\n' +
  '  const clics = signal(0);\n' +
  '  globalThis.__raw = { post: (v) => post.set(v), uno, dos, sumar: () => clics.set(clics() + 1) };\n' +
  '}\n';

const component = (tag: string, markup: string): string =>
  `${CODE}<${tag}>\n  <template shadowrootmode="open">${markup}</template>\n</${tag}>\n`;

const MARKUP =
  '<article class="post">\n  @raw(post())\n</article>' +
  '<div class="crudo">@raw(falsa)</div>' +
  '<p class="clics">@clics()</p>';

function graphOf(tag: string, source: string): ComponentGraph {
  return resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud': `<link rel="component" href="./${tag}.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
      [`/${tag}.fud`]: source,
    }),
  );
}

describe('the emitted text', () => {
  const graph = graphOf('x-raw', component('x-raw', MARKUP + '<x-b>@raw(uno)</x-b>'));
  const server = emitComponentModule(graph, graph.components.get('x-raw')!);
  const client = emitComponentClientModuleMapped(graph, graph.components.get('x-raw')!).code;

  it('the server writes the content with setHtml, not as children', () => {
    expect(server).toMatch(/\$dom\.setHtml\(\$n\d+, \(post\(\)\)\);/u);
    expect(server).toMatch(/\$dom\.setHtml\(\$n\d+, \(falsa\)\);/u);
    // The blank text around the `@raw` is formatting: no text node is built for it.
    expect(server).not.toContain('$dom.text("\\n');
  });

  it('the server writes it into the light DOM of a host too', () => {
    expect(server).toMatch(/\$dom\.element\("x-b"\);\n\s*\$dom\.setHtml\(\$n\d+, \(uno\)\);/u);
  });

  it('the client makes it one guarded value write in $a', () => {
    expect(client).toMatch(/\$v = post\(\);\n\s*if \(\$v !== \$w\[\d+\]\) \{ \$w\[\d+\] = \$v; \$dom\.setHtml\(\$n\d+, \$v\); \}/u);
    expect(client).toMatch(/\$v = falsa;\n\s*if \(\$v !== \$w\[\d+\]\) \{ \$w\[\d+\] = \$v; \$dom\.setHtml\(\$n\d+, \$v\); \}/u);
  });

  it('h adopts the element and never enters it', () => {
    const h = client.slice(client.indexOf('h: () => {'), client.indexOf('u: () =>'));
    // Three siblings and one host, adopted by `nextElementSibling` — no cursor goes down into
    // the article or the div, whose children the HTML made and nobody counted.
    expect(h).not.toMatch(/firstElementChild\(\$n|firstChild\(\$n|lastChild\(\$n0\)/u);
    expect(h).not.toContain('setHtml');
  });
});

type Probe = { post: (v: unknown) => void; uno: unknown; dos: unknown; sumar: () => void };
const probe = (): Probe => (globalThis as unknown as { __raw: Probe }).__raw;

describe('run over a live DOM', () => {
  const graph = graphOf('x-run-raw', component('x-run-raw', MARKUP));

  it('the server paints trusted HTML as markup and an unmarked string as text', () => {
    expect(serverShadowHtml(graph, 'x-run-raw', {})).toBe(
      '<article class="post"><h3>Primer post</h3><p>Con <em>énfasis</em>.</p></article>' +
        '<div class="crudo">&lt;b&gt;esto no está marcado&lt;/b&gt;</div>' +
        '<p class="clics">0</p>',
    );
  });

  it('create paints the same tree the server painted', () => {
    const host = document.createElement('x-run-raw');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.append(host);
    controller(clientFactory(graph, 'x-run-raw'), browserDom, shadow, []).c();
    const painted = mountAsDsd('x-run-raw', serverShadowHtml(graph, 'x-run-raw', {})).shadow;
    expect(shadow.innerHTML).toBe(painted.innerHTML);
    expect(shadow.querySelector('.crudo b')).toBeNull();
  });

  it('hydrate adopts the HTML the server wrote, node for node', () => {
    const { shadow } = mountAsDsd('x-run-raw', serverShadowHtml(graph, 'x-run-raw', {}));
    const em = shadow.querySelector('.post em');
    controller(clientFactory(graph, 'x-run-raw'), browserDom, shadow, []).h();
    expect(shadow.querySelector('.post em')).toBe(em);
  });

  it('a signal rewrites the content, and only the content', () => {
    const { shadow } = mountAsDsd('x-run-raw', serverShadowHtml(graph, 'x-run-raw', {}));
    controller(clientFactory(graph, 'x-run-raw'), browserDom, shadow, []).h();
    const article = shadow.querySelector('article.post');

    probe().post(probe().dos);
    expect(shadow.querySelector('article.post')).toBe(article);
    expect(article!.querySelectorAll('li')).toHaveLength(2);
    expect(article!.querySelector('h3')!.textContent).toBe('Segundo post');

    probe().post(probe().uno);
    expect(article!.querySelector('em')!.textContent).toBe('énfasis');
    expect(article!.querySelector('ul')).toBeNull();
  });

  // `h` adopts the element and seeds `$w` with what the server painted, so the FIRST update
  // after hydrating — any signal at all — does not rewrite an `@raw` with the value it already
  // had: the HTML's nodes survive, as they do after `c`, whose `$a` fills `$w`.
  it('an update that does not touch the value leaves the HTML´s nodes alone', () => {
    const { shadow } = mountAsDsd('x-run-raw', serverShadowHtml(graph, 'x-run-raw', {}));
    controller(clientFactory(graph, 'x-run-raw'), browserDom, shadow, []).h();
    const em = shadow.querySelector('.post em');

    probe().sumar();
    expect(shadow.querySelector('.clics')!.textContent).toBe('1');
    // The guard `$w` is what keeps a rewrite of the same value from rebuilding the content —
    // which would drop focus, selection and anything typed into an input inside it.
    expect(shadow.querySelector('.post em')).toBe(em);
  });
});
