/**
 * Client module emit (SDD-15 §3.7, §4.2, §4.6). The chunk is asserted structurally — the
 * byte-for-byte lock lives in `golden.test.ts` — and the shapes the four home fixtures do
 * not exercise are built here from in-memory graphs: `@foreach`, a `class:` with no static
 * `class`, an interpolated attribute, and a component with no `@code` at all.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  resolveComponents,
  emitComponentClientModule,
  emitComponentClientModuleMapped,
  type ComponentGraph,
  type EmitOptions,
} from '../../src/emit/index.js';
import { fixturesDir, fixtureIo, memoryIo } from './_support.js';

const graph: ComponentGraph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);
const chunk = (tag: string): string => emitComponentClientModule(graph, graph.components.get(tag)!);

/** A one-component graph from an in-memory page that links it. */
function inlineChunk(tag: string, component: string, options: EmitOptions = {}): string {
  const io = memoryIo({
    '/page.fud': `<link rel="component" href="./${tag}.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
    [`/${tag}.fud`]: component,
  });
  const g = resolveComponents('/page.fud', io);
  return emitComponentClientModule(g, g.components.get(tag)!, options);
}

describe('emitComponentClientModule — the module shape (§6.8)', () => {
  const src = chunk('app-card');

  it('carries the factory and the define, and NOT the instance scaffolding', () => {
    expect(src).toContain("import { FudicElement } from '@fudic/core';");
    expect(src).toContain('customElements.define("app-card", class extends FudicElement {');
    expect(src).toContain('static c($props) {');
    // All of this lives in the base class, inherited — never emitted per component.
    expect(src).not.toContain('h(props)');
    expect(src).not.toContain('c(props)');
    expect(src).not.toContain('disconnectedCallback');
    expect(src).not.toContain('#controller');
  });

  it('returns exactly {c, h, r}: m and s are closures, and there is no u (§6.11)', () => {
    expect(src).toContain('const m = () =>');
    expect(src).toContain('const s = () => {};');
    expect(src).toMatch(/return \{\n\s+c: \(\) => \{/u);
    expect(src).toContain('h: () => {');
    expect(src).toContain('r: () => {');
    expect(src).not.toMatch(/^\s+[mu]: /mu);
  });

  it('bakes the positional destructuring of $props, defaults included (§4.2)', () => {
    expect(src).toContain("let [$dom, $shadow, title, variant = 'default'] = $props;");
  });

  it('hoists the @client imports and inlines the rest of the region', () => {
    expect(src).toContain("import { signal } from '@fudic/core';");
    expect(src).toContain('const expanded = signal(false);'); // inside the factory
    expect(src.indexOf("import { signal }")).toBeLessThan(src.indexOf('customElements.define'));
  });

  it('mounts the roots through m() on create, and never on hydrate', () => {
    const create = src.slice(src.indexOf('c: () => {'), src.indexOf('h: () => {'));
    const hydrate = src.slice(src.indexOf('h: () => {'), src.indexOf('r: () => {'));
    expect(create).toContain('m();');
    expect(create).toContain('s();');
    expect(hydrate).not.toContain('m();'); // the structure came mounted from SSR
    expect(hydrate).toContain('s();'); // but the hookup is the same one
  });

  it('adopts with a cursor over every node, text included (§4.9)', () => {
    expect(src).toContain('let $c0 = $dom.firstChild($shadow);');
    expect(src).toContain('$n0 = $c0; $c0 = $dom.nextSibling($c0);');
    expect(src).not.toContain('.children['); // would skip the text nodes the emit keeps
    expect(src).not.toContain('querySelector');
    expect(src).not.toContain('cloneNode');
  });

  it('fabricates a child host without opening its shadow or driving it', () => {
    expect(src).toContain('$n16 = $dom.element("app-button");');
    expect(src).toContain(`$dom.setAttr($n16, 'data-adopt', "app-button");`);
    expect(src).not.toContain('attachShadow'); // the runtime owns the child (SDD-17)
    expect(src).not.toContain('renderAppButton');
  });

  it('releases every node reference and runs the disposers on r()', () => {
    expect(src).toContain('$n22 = $shadow = null; $d.forEach((d) => d());');
  });

  it('emits the same control flow into both bodies', () => {
    // One instance takes create OR hydrate, never both: the condition is written twice and
    // still evaluated once.
    expect(src.match(/if \(expanded\.peek\(\)\) \{/gu)).toHaveLength(4); // 2 per body
    expect(src.match(/\} else \{/gu)).toHaveLength(2);
  });
});

describe('emitComponentClientModule — a component with no @code', () => {
  const src = chunk('app-badge');

  it('still gets a chunk, with no props and no client body', () => {
    expect(src).toContain('customElements.define("app-badge", class extends FudicElement {');
    expect(src).toContain('let [$dom, $shadow, tone = \'neutral\'] = $props;');
  });

  it('gets one even with nothing to destructure at all', () => {
    const src2 = inlineChunk(
      'x-plain',
      '<x-plain>\n  <template shadowrootmode="open"><span>hi</span></template>\n</x-plain>\n',
    );
    expect(src2).toContain('let [$dom, $shadow] = $props;');
    expect(src2).toContain('$n0 = $dom.element("span");');
  });

  it('emits an empty template without a cursor it would never use', () => {
    const src2 = inlineChunk(
      'x-empty',
      '<x-empty>\n  <template shadowrootmode="open"></template>\n</x-empty>\n',
    );
    expect(src2).not.toContain('$dom.firstChild');
    expect(src2).toContain('r: () => { $shadow = null;');
  });
});

describe('emitComponentClientModule — shapes the fixtures do not cover', () => {
  it('lowers @foreach into both bodies, sharing the cursor', () => {
    const src = inlineChunk(
      'x-list',
      '@code {\n  const { items } = props<{ items: string[] }>();\n}\n' +
        '<x-list>\n  <template shadowrootmode="open">' +
        '<ul>@foreach (const item of items) {<li>@item</li>}</ul>' +
        '</template>\n</x-list>\n',
    );
    expect(src.match(/for \(const item of items\) \{/gu)).toHaveLength(2);
    expect(src).toContain('$n2 = $dom.text(String((item) ?? \'\'));');
    expect(src).toContain('$n1 = $c1; $c1 = $dom.nextSibling($c1);');
  });

  it('lowers an else-if chain into both bodies', () => {
    const src = inlineChunk(
      'x-chain',
      '@code {\n  const { n } = props<{ n: number }>();\n}\n' +
        '<x-chain>\n  <template shadowrootmode="open">' +
        '@if (n === 1) { <i></i> } else if (n === 2) { <b></b> } else { <u></u> }' +
        '</template>\n</x-chain>\n',
    );
    expect(src.match(/\} else if \(n === 2\) \{/gu)).toHaveLength(2);
    expect(src.match(/if \(n === 1\) \{/gu)).toHaveLength(2);
  });

  it('composes class from the bindings alone when there is no static class', () => {
    const src = inlineChunk(
      'x-cls',
      '@code {\n  const { on } = props<{ on: boolean }>();\n}\n' +
        '<x-cls>\n  <template shadowrootmode="open"><b class:hot="@on"></b></template>\n</x-cls>\n',
    );
    expect(src).toContain(`$dom.setAttr($n0, 'class', [(on) && "hot"].filter(Boolean).join(' '));`);
  });

  it('keeps whitespace verbatim where the browser would, and drops nothing', () => {
    const src = inlineChunk(
      'x-pre',
      '<x-pre>\n  <template shadowrootmode="open"><pre>a   b</pre></template>\n</x-pre>\n',
    );
    expect(src).toContain('$n1 = $dom.text("a   b");'); // collapsed would be "a b"
  });

  it('emits nothing for a node with no client markup, and keeps the walk aligned', () => {
    const src = inlineChunk(
      'x-cmt',
      '<x-cmt>\n  <template shadowrootmode="open"><i></i><!-- gone --><u></u></template>\n</x-cmt>\n',
    );
    // Two element nodes, and no third variable for the comment: it is not in the DOM the
    // server painted either, so the cursor stays in step.
    expect(src).toContain('let $n0, $n1;');
    expect(src).not.toContain('gone');
  });

  it('references a linked asset through the import Vite resolves', () => {
    const src = inlineChunk(
      'x-img',
      '<x-img>\n  <template shadowrootmode="open"><img src="./a.png"></template>\n</x-img>\n',
      { linkAssets: true, assetExists: () => true },
    );
    expect(src).toContain('import __fudic_asset_0 from "./a.png";');
    expect(src).toContain('$dom.setAttr($n0, "src", __fudic_asset_0);');
  });

  it('builds a template literal for a mixed attribute value', () => {
    const src = inlineChunk(
      'x-mix',
      '@code {\n  const { id } = props<{ id: string }>();\n}\n' +
        '<x-mix>\n  <template shadowrootmode="open"><a href="/p/@id/x"></a></template>\n</x-mix>\n',
    );
    expect(src).toContain('const $a = `/p/${id}/x`;');
  });
});

describe('emitComponentClientModuleMapped', () => {
  it('anchors an interpolation back to its offset in the .fud', () => {
    const comp = graph.components.get('app-card')!;
    const out = emitComponentClientModuleMapped(graph, comp);
    expect(out.code).toBe(emitComponentClientModule(graph, comp));
    expect(out.missingAssets).toEqual([]);
    expect(out.mappings.length).toBeGreaterThan(0);
    const mapped = out.mappings.map((m) => comp.source.slice(m.sourceOffset, m.sourceOffset + 5));
    expect(mapped).toContain('title'); // the `@title` of the <h2>
  });
});
