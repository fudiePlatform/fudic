/**
 * A data `<script>` is emitted verbatim (decision 129, BUG-29).
 *
 * fudic does not support inline script — a `<script>` of code with a body is `FUD0161` — and
 * these two are the reason the rule is about CODE and not about bodies. The browser does not
 * run them, it reads them, and neither has a `src` form that means the same thing:
 *
 *  - `application/ld+json` is how a page explains itself to a search engine and to a
 *    conversational AI. A `.json` served apart and pointed at with a `<link>` is not the same
 *    document to a crawler.
 *  - `importmap` must, by specification, be inline and precede the first module.
 *
 * The suite renders the emitted module and reads the HTML, because the defect it was written
 * for was invisible in every other form: the module was fine, the tag came out, and the body
 * was gone. Only the output shows it.
 *
 * The other half is `@`. Decision 43 makes a `<script>` body raw for the LEXER, so `@context`
 * and `@type` — the two keys JSON-LD is built out of — must arrive as the four characters the
 * author typed and not as a Razor interpolation. If that were ever to break, JSON-LD would be
 * unwritable no matter what the emit does, so it is asserted here beside it.
 */

import { describe, expect, it } from 'vitest';
import {
  resolveComponents,
  emitComponentModule,
  emitComponentClientModule,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { SsrDom, renderToString } from '@fudic/ssr';
import { evalLeafModule, memoryIo } from './_support.js';

const LD = '{"@context":"https://schema.org","@type":"Product","name":"fudic"}';
const MAP = '{"imports":{"lit":"/vendor/lit.js"}}';

const COMPONENT = `<app-doc>
  <template shadowrootmode="open">
    <script type="application/ld+json">${LD}</script>
    <script type="importmap">${MAP}</script>
    <script src="/probe.js"></script>
    <p>hi</p>
  </template>
</app-doc>
`;

const PAGE = `<link rel="component" href="./app-doc.fud">
<html><head></head><body><app-doc></app-doc></body></html>
`;

const graph: ComponentGraph = resolveComponents(
  '/page.fud',
  memoryIo({ '/page.fud': PAGE, '/app-doc.fud': COMPONENT }),
);
const component = graph.components.get('app-doc')!;
const serverModule = emitComponentModule(graph, component);
const clientChunk = emitComponentClientModule(graph, component);

/** The HTML the SSR module paints for one instance — the emitted `render`, actually run. */
function painted(): string {
  const dom = new SsrDom();
  const host = dom.element('app-doc');
  evalLeafModule(serverModule).render(dom, dom.attachShadow(host), {});
  return renderToString(host);
}

describe('a data `<script>` reaches the HTML (decision 129)', () => {
  const html = painted();

  it('JSON-LD arrives with its body, which is the whole point of it', () => {
    expect(html).toContain(`<script type="application/ld+json">${LD}</script>`);
  });

  it('and `@context` / `@type` survive as written', () => {
    // The failure this guards against is not the emit's: a `<script>` body is raw for the
    // lexer (decision 43), and if it ever stopped being raw these two would become Razor
    // interpolations and JSON-LD could not be written at all.
    expect(html).toContain('"@context":"https://schema.org"');
    expect(html).toContain('"@type":"Product"');
  });

  it('the import map arrives too, because it cannot live in another file', () => {
    expect(html).toContain(`<script type="importmap">${MAP}</script>`);
  });

  it('the body is not HTML-escaped: a `&quot;` is not a quote to a JSON parser', () => {
    expect(html).not.toContain('&quot;');
    expect(html).toContain('"name":"fudic"');
  });

  it('a `<script src>` of code keeps coming out empty, as it should', () => {
    expect(html).toContain('<script src="/probe.js"></script>');
  });

  it('the client chunk fabricates the same body, so `c` and `h` end with one tree', () => {
    // The equivalence hydration rests on: what `c()` builds is what the HTML gives back.
    expect(clientChunk).toContain(JSON.stringify(LD));
    expect(clientChunk).toContain(JSON.stringify(MAP));
  });
});
