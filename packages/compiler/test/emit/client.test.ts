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

  it('adopts with an ELEMENT cursor, never by counting nodes (§4.9)', () => {
    expect(src).toContain('let $c0 = $dom.firstElementChild($shadow);');
    expect(src).toContain('$n0 = $c0; $c0 = $dom.nextElementSibling($c0);');
    // Counting nodes is what a round trip through HTML breaks: two adjacent text nodes
    // serialize with no boundary between them and come back as one.
    expect(src).not.toContain('$dom.nextSibling($c');
    expect(src).not.toContain('$dom.childAt');
    expect(src).not.toContain('.children[');
    expect(src).not.toContain('querySelector');
    expect(src).not.toContain('cloneNode');
  });

  it('gives a reference only to the text that can change', () => {
    // `@title` is adopted, from the <h2> that holds it; every whitespace run is created
    // inline on the fabricate path and never looked up again — nobody rewrites a space.
    expect(src).toContain('$n3 = $dom.lastChild($n2);');
    expect(src).toContain('$dom.append($n0, $dom.text(" "));');
    expect(src).toContain('$r.push($dom.text(" "));');
    expect(src).toContain('$dom.append($n6, $dom.text(" Abrir "));');
  });

  it('fabricates a child host without opening its shadow or driving it', () => {
    expect(src).toContain('$n6 = $dom.element("app-button");');
    expect(src).toContain(`$dom.setAttr($n6, 'data-adopt', "app-button");`);
    expect(src).not.toContain('attachShadow'); // the runtime owns the child (SDD-17)
    expect(src).not.toContain('renderAppButton');
  });

  it('releases every node reference and runs the disposers on r()', () => {
    expect(src).toContain('$n6 = $shadow = null; $d.forEach((d) => d());');
  });

  it('emits the same control flow into both bodies — where there is anything to adopt', () => {
    // One instance takes create OR hydrate, never both: the condition is written twice and
    // still evaluated once. The `@if` inside <app-button> is the exception: its branches
    // hold nothing but static text, so the adopt body never asks the question — it has no
    // reference to take, and no element to step the cursor over.
    expect(src.match(/if \(expanded\.peek\(\)\) \{/gu)).toHaveLength(3);
    expect(src.match(/\} else \{/gu)).toHaveLength(1);
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
    expect(src2).not.toContain('$dom.firstElementChild');
    expect(src2).toContain('r: () => { $shadow = null;');
  });

  it('opens no cursor and no block for a subtree that is pure static markup', () => {
    const src2 = inlineChunk(
      'x-static',
      '<x-static>\n  <template shadowrootmode="open"><b>hi <u>there</u></b></template>\n</x-static>\n',
    );
    const hydrate = src2.slice(src2.indexOf('h: () => {'), src2.indexOf('r: () => {'));
    // The <b> and the <u> are still adopted — an element is always a reference — but the
    // text inside them writes nothing at all.
    expect(hydrate).toContain('$n1 = $c1; $c1 = $dom.nextElementSibling($c1);');
    expect(hydrate).not.toContain('$dom.text');
    expect(hydrate).not.toContain('lastChild');
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
    expect(src).toContain('$n1 = $c1; $c1 = $dom.nextElementSibling($c1);');
    expect(src).toContain('$n2 = $dom.lastChild($n1);'); // @item, from the <li> of its turn
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
    expect(src).toContain('$dom.append($n0, $dom.text("a   b"));'); // collapsed would be "a b"
  });

  it('keeps it verbatim inside a run that is part text, part interpolation', () => {
    const src = inlineChunk(
      'x-premix',
      '@code {\n  const { name } = props<{ name: string }>();\n}\n' +
        '<x-premix>\n  <template shadowrootmode="open"><pre>a   @name</pre></template>\n</x-premix>\n',
    );
    // One node for the whole run, and the literal half of it untouched: a `<pre>` does not
    // stop being a `<pre>` because there is an expression in the middle of it.
    expect(src).toContain("$n1 = $dom.text(`a   ${(name) ?? ''}`);");
  });

  it('emits a @foreach on the fabricate path alone when it holds nothing to adopt', () => {
    const src = inlineChunk(
      'x-plainloop',
      '@code {\n  const { items } = props<{ items: string[] }>();\n}\n' +
        '<x-plainloop>\n  <template shadowrootmode="open">' +
        '<ul>@foreach (const item of items) { x }</ul>' +
        '</template>\n</x-plainloop>\n',
    );
    const hydrate = src.slice(src.indexOf('h: () => {'), src.indexOf('r: () => {'));
    expect(src.match(/for \(const item of items\) \{/gu)).toHaveLength(1);
    expect(hydrate).not.toContain('for (');
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

/**
 * How the adopt path FINDS a text node it may have to rewrite. It never counts: a run is
 * reached from the element beside it, and which element that is decides the form. The four
 * cases below are every form the emit can write, and the fixtures only ever produce one.
 */
describe('emitComponentClientModule — anchoring an interpolated run', () => {
  const runChunk = (tag: string, markup: string): string =>
    inlineChunk(
      tag,
      '@code {\n  const { name, on } = props<{ name: string; on: boolean }>();\n}\n' +
        `<${tag}>\n  <template shadowrootmode="open">${markup}</template>\n</${tag}>\n`,
    );

  it('coalesces a run of text and interpolation into ONE node', () => {
    // The reason the anchors work at all: HTML has no boundary between two text nodes, so
    // what the parser gives back is one. The emit builds one to match — on both paths.
    const src = runChunk('x-run', '<b>hello @name<i></i></b>');
    expect(src).toContain('$n1 = $dom.text(`hello ${(name) ?? \'\'}`);');
    expect(src.match(/\$dom\.text\(/gu)).toHaveLength(1);
  });

  it('takes the previous sibling of the cursor when an element follows', () => {
    const src = runChunk('x-prev', '<b>@name<i></i></b>');
    expect(src).toContain('$n1 = $dom.previousSibling($c1);');
  });

  it('asks at runtime when only a construct follows, because it may render nothing', () => {
    const src = runChunk('x-tern', '<b>@name @if (on) { <i></i> }</b>');
    expect(src).toContain('$n1 = $c1 ? $dom.previousSibling($c1) : $dom.lastChild($n0);');
  });

  it('takes the last node when nothing that follows can be an element', () => {
    const src = runChunk('x-notxt', '<b>@name @if (on) { x }</b>');
    expect(src).toContain('$n1 = $dom.lastChild($n0);');
    expect(src).not.toContain('let $c1'); // no element at that level: no cursor either
  });

  it('takes the last node for a trailing run, past the elements before it', () => {
    const src = runChunk('x-last', '<b><i></i>@name</b>');
    expect(src).toContain('$n2 = $dom.lastChild($n0);');
  });

  it('adopts through a branch whose element is only in the else', () => {
    const src = runChunk('x-else', '<b>@if (on) { x } else { <i></i> }</b>');
    const hydrate = src.slice(src.indexOf('h: () => {'), src.indexOf('r: () => {'));
    expect(hydrate).toContain('} else {');
    expect(hydrate).toContain('$n1 = $c1; $c1 = $dom.nextElementSibling($c1);');
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
