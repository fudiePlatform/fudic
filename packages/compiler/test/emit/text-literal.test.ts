/**
 * BUG-14 — the author's literal text has to reach the output intact.
 *
 * Two ways of writing one character, both of them literal text the author typed, both of
 * them checked here on the SAME component: the `@@` escape (decision 1) and an HTML entity
 * (decision 49, as BUG-14 §3.2 corrects it). A component is the subject because it is the
 * only shape that has BOTH outputs — the SSR module and the client chunk — and the whole
 * point is that the two paint the same character.
 *
 * The fourth test is the opposite guarantee, and it is why the other three are safe: an
 * INTERPOLATED value is not the author's text, and it keeps being escaped (§4.2).
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

const COMPONENT = `@code {
  const { value = '' } = props<{ value?: string }>();
}

<head>
  <style>:host { display: block; content: "@@ &lt;"; }</style>
</head>

<app-doc>
  <template shadowrootmode="open">
    <code>@@server load</code>
    <code>&lt;html&gt;</code>
    <p title="@@x &lt;y&gt;">@(value)</p>
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
function painted(value: string): string {
  const dom = new SsrDom();
  const host = dom.element('app-doc');
  evalLeafModule(serverModule).render(dom, dom.attachShadow(host), { value });
  return renderToString(host);
}

describe('`@@` in content (§6.1)', () => {
  it('the SSR module builds the text with the literal `@`', () => {
    expect(serverModule).toContain('$dom.text("@server load")');
  });

  it('the client chunk builds the same text', () => {
    expect(clientChunk).toContain('$dom.text("@server load")');
  });

  it('and the painted HTML carries it', () => {
    expect(painted('')).toContain('<code>@server load</code>');
  });
});

describe('an entity in content (§6.2)', () => {
  it('the node data is the CHARACTER, on both branches', () => {
    expect(serverModule).toContain('$dom.text("<html>")');
    expect(clientChunk).toContain('$dom.text("<html>")');
  });

  it('the serializer escapes it exactly once', () => {
    const html = painted('');
    expect(html).toContain('<code>&lt;html&gt;</code>');
    expect(html).not.toContain('&amp;lt;');
  });
});

describe('an attribute value behaves like content (§6.6)', () => {
  it('the same characters reach the final HTML', () => {
    expect(painted('')).toContain('title="@x <y>"');
  });
});

describe('the CSS branch is NOT touched (§6.7)', () => {
  // A `<style>` body is not a node's data: it is CSS, where `@@` and `&lt;` mean the
  // characters they spell. BUG-08 made that explicit and this correction leaves it alone.
  it('keeps `@@` and an entity verbatim in the sheet', () => {
    expect(serverModule).toContain('content:"@@ &lt;"');
  });
});

describe('an interpolation is still escaped (§6.4)', () => {
  // The net under the three tests above: `escapeText` has not lost its job. Literal text
  // is the author's; an interpolated value is data, and data never becomes markup.
  it('a value carrying markup comes out inert', () => {
    const html = painted('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });
});
