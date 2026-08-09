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

/**
 * The COMPONENT's own controller, past every block function.
 *
 * A block returns the same shape as a component (SDD-30 §3.2), so a chunk with blocks in
 * it holds several `c: () => {`. The component's is the last one, because its blocks are
 * declared above it — in the closure they read through.
 */
const controller = (src: string): string => src.slice(src.lastIndexOf('return {'));

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

  it('returns exactly {c, h, u, r}: $m, $s and $a are closures (§6.11, BUG-12 §3.3)', () => {
    expect(src).toContain('const $m = () =>');
    expect(src).toContain('const $s = () => {};');
    expect(src).toContain('const $a = () => {');
    expect(src).toMatch(/return \{\n\s+c: \(\) => \{/u);
    expect(src).toContain('h: () => {');
    expect(src).toContain('u: ($p) => {');
    expect(src).toContain('r: () => {');
    // A BLOCK does expose `m` and `s` — its parent decides when it mounts (SDD-30 §3.2) —
    // but the component's own controller is still the four of BUG-12 §3.1.
    expect(controller(src)).not.toMatch(/^\s+[msa]: /mu);
  });

  it('keeps every identifier the emit introduces inside the $ reserve (BUG-12 §3.5)', () => {
    // The `@client` body is copied verbatim into this same closure, so a name the emit
    // takes outside the reserve is a name it can collide with. `m` and `s` were two.
    const factory = src.slice(src.indexOf('static c($props) {'));
    expect(factory).not.toMatch(/^\s+const [ms] = \(\) =>/mu);
  });

  it('bakes the positional destructuring of $props, defaults included (§4.2)', () => {
    expect(src).toContain("let [$dom, $shadow, title, variant = 'default'] = $props;");
  });

  it('hoists the @client imports and inlines the rest of the region', () => {
    expect(src).toContain("import { signal } from '@fudic/core';");
    expect(src).toContain('const expanded = signal(false);'); // inside the factory
    expect(src.indexOf("import { signal }")).toBeLessThan(src.indexOf('customElements.define'));
  });

  it('mounts the roots through $m() on create, and never on hydrate', () => {
    const own = controller(src);
    const create = own.slice(own.indexOf('c: () => {'), own.indexOf('h: () => {'));
    const hydrate = own.slice(own.indexOf('h: () => {'), own.indexOf('u: ($p) => {'));
    expect(create).toContain('$m();');
    expect(create).toContain('$s();');
    expect(hydrate).not.toContain('$m();'); // the structure came mounted from SSR
    expect(hydrate).toContain('$s();'); // but the hookup is the same one
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

  it('gives a reference only to the text that needs one', () => {
    // `@title` is adopted, from the <h2> that holds it. A whitespace run OUTSIDE a block
    // gets none — nobody rewrites a space — unless a construct sits in front of it, and
    // then the run is the anchor an update inserts before (SDD-30 §3.4).
    expect(controller(src)).toContain('$n5 = $dom.lastChild($n4);');
    expect(src).toContain('$dom.append($n0, $dom.text(" "));'); // no construct behind it
    expect(src).toContain('$n2 = $dom.text(" ");'); // the run right after the first @if
  });

  it('names every root of a BLOCK, whitespace included', () => {
    // A block moves and removes what it rendered, so a root it cannot name is a node its
    // `r()` would leave behind — which is exactly the second defect of SDD-30 §1.
    const block = src.slice(src.indexOf('const $b0 ='), src.indexOf('const $q0 ='));
    expect(block).toContain('$n6 = $dom.text(" ");');
    expect(block).toContain('$r.push($n6);');
    expect(block).toContain('for (const $n of $r) $dom.remove($n);');
  });

  it('fabricates a child host without opening its shadow or driving it', () => {
    expect(src).toContain('$n3 = $dom.element("app-button");');
    expect(src).toContain(`$dom.setAttr($n3, 'data-adopt', "app-button");`);
    expect(src).not.toContain('attachShadow'); // the runtime owns the child (SDD-17)
    expect(src).not.toContain('renderAppButton');
  });

  it('retires the blocks and releases every node reference on r()', () => {
    // The registries first: nulling a variable per node released ONE row of a construct
    // and left the rest — with their disposers — hanging off a DOM nobody owns (§1).
    expect(controller(src)).toContain(
      'r: () => { $k0.forEach(($i) => $i.r()); $k1.forEach(($i) => $i.r()); ',
    );
    expect(controller(src)).toContain('$shadow = null; $d.forEach((d) => d()); },');
  });

  it('asks the condition ONCE, in the selector the three bodies share', () => {
    // Flattened, the condition was written into `c`, into `h` and into `$a` — three copies
    // of one question, three chances to answer it differently. Now `$qN` is the answer and
    // create, adopt and update all read it.
    expect(src).toContain('const $q0 = () => (expanded.peek() ? 0 : -1);');
    expect(src).toContain('const $q1 = () => (expanded.peek() ? 0 : 1);');
    expect(src.match(/expanded\.peek\(\) \?/gu)).toHaveLength(2);
    // And no branch is written as control flow in a body any more.
    expect(controller(src)).not.toContain('if (expanded.peek())');
  });

  it('gives every branch its own block, with its own nodes', () => {
    // Two arms of an `@if` share neither nodes nor signature (§4.1): `$b1` is the `then`
    // of the inner `@if` and `$b2` its `else`, and `$f1` is what picks between them.
    expect(src).toContain('const $b1 = ($parent, $anchor) => {');
    expect(src).toContain('const $b2 = ($parent, $anchor) => {');
    expect(src).toContain('const $f1 = ($x, $an) => $x === 0 ? $b1($n3, $an) : $x === 1 ? $b2($n3, $an) : null;');
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
  it('drives a @foreach through the block, chaining the cursor on the adopt path', () => {
    const src = inlineChunk(
      'x-list',
      '@code {\n  const { items } = props<{ items: string[] }>();\n}\n' +
        '<x-list>\n  <template shadowrootmode="open">' +
        '<ul>@foreach (const item of items) key (item) {<li>@item</li>}</ul>' +
        '</template>\n</x-list>\n',
    );
    // The loop runs in the PARENT — the header is the author's, spliced whole — and each
    // turn builds one instance of the block, which owns the row's nodes.
    expect(src).toContain('const $b0 = ($parent, $anchor, item) => {');
    expect(src).toContain('const $i = $b0($n0, null, item);');
    expect(src).toContain('$c1 = $i.h($c1);'); // the block takes the cursor and gives it back
    expect(src).toContain('$k0.push($i);');
    // The row's own text is the block's, written by the block's `$a` — not fused any more.
    expect(src).toContain("$dom.setText($n2, $v);");
    expect(src).toContain('key: item,');
  });

  it('gives an else-if chain three blocks and one selector', () => {
    const src = inlineChunk(
      'x-chain',
      '@code {\n  const { n } = props<{ n: number }>();\n}\n' +
        '<x-chain>\n  <template shadowrootmode="open">' +
        '@if (n === 1) { <i></i> } else if (n === 2) { <b></b> } else { <u></u> }' +
        '</template>\n</x-chain>\n',
    );
    expect(src).toContain('const $q0 = () => (n === 1 ? 0 : n === 2 ? 1 : 2);');
    expect(src.match(/const \$b\d = \(\$parent, \$anchor\) => \{/gu)).toHaveLength(3);
    // The conditions are written once each, in the selector, and nowhere else.
    expect(src.match(/n === 1/gu)).toHaveLength(1);
    expect(src.match(/n === 2/gu)).toHaveLength(1);
  });

  it('composes class from the bindings alone when there is no static class', () => {
    const src = inlineChunk(
      'x-cls',
      '@code {\n  const { on } = props<{ on: boolean }>();\n}\n' +
        '<x-cls>\n  <template shadowrootmode="open"><b class:hot="@on"></b></template>\n</x-cls>\n',
    );
    // The composition is a value now — a `class:` binding can move — so it rides `$a()`.
    expect(src).toContain(`$v = [(on) && "hot"].filter(Boolean).join(' ');`);
    expect(src).toContain(`$dom.setAttr($n0, 'class', $v);`);
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
    expect(src).toContain("$n1 = $dom.text('');");
    expect(src).toContain("$v = `a   ${(name) ?? ''}`;");
  });

  it('runs a loop on the adopt path too, even with nothing but text in it', () => {
    const src = inlineChunk(
      'x-plainloop',
      '@code {\n  const { items } = props<{ items: string[] }>();\n}\n' +
        '<x-plainloop>\n  <template shadowrootmode="open">' +
        '<ul>@foreach (const item of items) key (item) { x }</ul>' +
        '</template>\n</x-plainloop>\n',
    );
    // A hydrated row still has to be a row: without an instance nothing could retire it,
    // reorder it, or hand it a value again. The loop is now in the parent's THREE bodies —
    // create, adopt and reconcile — and the block is what differs between them.
    expect(src.match(/for \(const item of items\) \{/gu)).toHaveLength(3);
    expect(controller(src)).toContain('$i.h(null);');
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
    expect(src).toContain('$v = `/p/${id}/x`;');
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
    expect(src).toContain("$v = `hello ${(name) ?? ''}`;");
    expect(src).toContain('$dom.setText($n1, $v);');
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
    // The cursor crosses the construct whichever arm is live: the block takes it in and
    // gives back the advanced one, and the arm with only text gives it back untouched.
    expect(src).toContain('$c1 = $i.h($c1);');
    // The `<i>` is the ELSE arm's, so the step over it belongs to that arm's block.
    expect(src).toContain('$n3 = $c; $c = $dom.nextElementSibling($c);');
  });
});

/**
 * BUG-12 — the update channel. A child receives a VALUE (decision 84), so receiving it
 * again is a call: `u` reassigns the positional bindings and `$a()` re-applies the writes
 * that depend on them. Create and update converge on `$a()`, so they cannot diverge; `h`
 * stays out of it, because the server already painted those values (§4.3).
 */
describe('emitComponentClientModule — u, the update channel (BUG-12)', () => {
  const src = chunk('app-card');
  const own = controller(src);
  const between = (from: string, to: string): string =>
    own.slice(own.indexOf(from), own.indexOf(to));

  it('routes every value write through $a(), the single place a value reaches a node (§6.3)', () => {
    expect(src).toContain('const $a = () => {');
    expect(src).toContain('$dom.setText($n5, $v);');
    expect(src).toContain(`$dom.setAttr($n0, 'class', $v);`);
    // The fabricate body creates the node and nothing else: the value is `$a`'s.
    expect(src).toContain('$n5 = $dom.text(\'\');');
    expect(between('c: () => {', 'h: () => {')).not.toContain('setText');
  });

  it('calls $a() from c and from u, and never from h (§6.3, §4.3)', () => {
    expect(between('c: () => {', 'h: () => {')).toContain('$a();');
    expect(between('u: ($p) => {', 'r: () => {')).toContain('$a();');
    expect(between('h: () => {', 'u: ($p) => {')).not.toContain('$a();');
  });

  it('orders create as fabricate → $a() → $m() → $s()', () => {
    const create = between('c: () => {', 'h: () => {');
    expect(create.indexOf('$a();')).toBeLessThan(create.indexOf('$m();'));
    expect(create.indexOf('$m();')).toBeLessThan(create.indexOf('$s();'));
  });

  it('reassigns, re-applies, and then reconciles its blocks (§6.4, SDD-30 §4.2)', () => {
    // `$dom` and `$shadow` are never reassigned: an update carries state, not the adapter.
    // The defaults are repeated because an update may bring `undefined` back. And `$a()`
    // comes FIRST: the values of this level, then what the constructs below make of them.
    expect(own).toContain(
      "u: ($p) => { [, , title, variant = 'default'] = $p; $a(); $u0(); $u1(); },",
    );
  });

  it('touches the DOM only where the value actually changed', () => {
    // The positional payload arrives whole and `$a()` re-applies all of it, so the filter
    // has to be per WRITE: `$w` holds what was last applied, and a write that would not
    // change a byte is not a write. A component with ten props must not repaint ten nodes
    // because one signal moved.
    expect(src).toContain('const $w = []; // last applied, per value write');
    expect(src).toMatch(/if \(\$v !== \$w\[0\]\) \{ \$w\[0\] = \$v; /u);
    expect(src).toMatch(/if \(\$v !== \$w\[1\]\) \{ \$w\[1\] = \$v; /u);
  });

  it('gives a component with nothing to re-apply an empty $a and no cache', () => {
    const src2 = inlineChunk(
      'x-nodyn',
      '<x-nodyn>\n  <template shadowrootmode="open"><b class="hi">hola</b></template>\n</x-nodyn>\n',
    );
    expect(src2).toContain('const $a = () => {};');
    expect(src2).not.toContain('const $w');
    expect(src2).toContain('u: () => { $a(); },'); // no props: nothing to reassign
  });

  it('puts the write of a branch in the BLOCK’s $a, with no condition around it', () => {
    const src2 = inlineChunk(
      'x-cond',
      '@code {\n  const { on, name } = props<{ on: boolean; name: string }>();\n}\n' +
        '<x-cond>\n  <template shadowrootmode="open">' +
        '@if (on) { <b title="@name"></b> }' +
        '</template>\n</x-cond>\n',
    );
    const block = src2.slice(src2.indexOf('const $b0 ='), src2.indexOf('const $q0 ='));
    // `$n0` belongs to the block and exists for as long as the block does, so the write
    // needs no guard: the instance not being alive IS the guard.
    expect(block).toContain('$dom.setAttr($n1, "title", String($v));');
    expect(block).not.toContain('if (on)');
    // And the component's own `$a` has nothing left to do.
    expect(controller(src2)).not.toContain('setAttr');
  });

  it('takes as parameters what the branch reads and cannot declare (§3.3)', () => {
    const src2 = inlineChunk(
      'x-branch',
      '@code {\n  const { on, name } = props<{ on: boolean; name: string }>();\n}\n' +
        '<x-branch>\n  <template shadowrootmode="open">' +
        '@if (on) { @name } else { nada }' +
        '</template>\n</x-branch>\n',
    );
    // The `then` reads `name`; the `else` reads nothing. Two arms, two signatures.
    expect(src2).toContain('const $b0 = ($parent, $anchor, name) => {');
    expect(src2).toContain('const $b1 = ($parent, $anchor) => {');
    expect(src2).toContain('$dom.setText($n0, $v);');
    expect(src2).toContain('u: (...$p) => { [name] = $p; $a(); },');
  });

  it('sees a class: binding inside a branch as a write of the block', () => {
    const src2 = inlineChunk(
      'x-clsif',
      '@code {\n  const { on } = props<{ on: boolean }>();\n}\n' +
        '<x-clsif>\n  <template shadowrootmode="open">' +
        '@if (on) { <b class:hot="@on"></b> }' +
        '</template>\n</x-clsif>\n',
    );
    const block = src2.slice(src2.indexOf('const $b0 ='), src2.indexOf('const $q0 ='));
    expect(block).toContain(`$dom.setAttr($n1, 'class', $v);`);
    // `on` decides the branch AND is read inside it, so it travels both ways.
    expect(src2).toContain('const $b0 = ($parent, $anchor, on) => {');
  });

  it('writes inside a @foreach through the row’s own $a — BUG-12 §3.3.c', () => {
    const src2 = inlineChunk(
      'x-loop',
      '@code {\n  const { items } = props<{ items: string[] }>();\n}\n' +
        '<x-loop>\n  <template shadowrootmode="open">' +
        '<ul>@foreach (const item of items) key (item) {<li>@item</li>}</ul>' +
        '</template>\n</x-loop>\n',
    );
    // The nodes of a row belong to its instance and live as long as it does, so the value
    // stops being fused with the creation and becomes reapplicable — which is the hole
    // BUG-12 left open for the inside of a loop.
    expect(src2).toContain("$n2 = $dom.text('');");
    expect(src2).toContain('$dom.setText($n2, $v);');
    expect(src2).toContain('u: (...$p) => { [item] = $p; $a(); },');
  });
});

/**
 * BUG-12 §3.4 — the parent side. `PropertyBinding` has existed in the AST since SDD-07
 * with no reader at all (§2.4); this is the first one. The parent owns the signal, so the
 * parent is who calls `u`: once up front with `peek()`, and again on every notification.
 */
describe('emitComponentClientModule — a child host that receives a value (BUG-12 §3.4)', () => {
  const CHILD =
    '@code {\n  const { value = 0 } = props<{ value?: number }>();\n}\n' +
    '<x-child>\n  <template shadowrootmode="open"><span>@value</span></template>\n</x-child>\n';

  /** A two-component graph: `x-host` holds an `x-child`, with the given host attributes. */
  const hostChunk = (attrs: string, child = CHILD, code = ''): string => {
    const io = memoryIo({
      '/page.fud':
        '<link rel="component" href="./x-host.fud">\n' +
        '<html><head></head><body><x-host></x-host></body></html>\n',
      '/x-host.fud':
        '<link rel="component" href="./x-child.fud">\n' +
        '@code {\n  @client {\n    import { signal } from \'@fudic/core\';\n' +
        `    const count = signal(0);\n${code}  }\n}\n` +
        '<x-host>\n  <template shadowrootmode="open">' +
        `<x-child ${attrs}></x-child>` +
        '</template>\n</x-host>\n',
      '/x-child.fud': child,
    });
    const g = resolveComponents('/page.fud', io);
    return emitComponentClientModule(g, g.components.get('x-host')!, {});
  };

  it('emits the initial pass and the subscription in $s(), with the disposer in $d (§6.5)', () => {
    const src = hostChunk('.value="@count"');
    const hook = src.slice(src.indexOf('const $s = () => {'), src.indexOf('return {'));
    // `$v` and not `v`: every identifier the emit introduces starts with `$` (§5), and the
    // payload around it is the author's code — a `v` of theirs would be shadowed here.
    expect(hook).toContain('$n0.u([, , count.peek()]);');
    expect(hook).toContain('$d.push(count.subscribe(($v) => { $n0.u([, , $v]); }));');
  });

  it('sends the child its WHOLE positional payload, not just the slot that moved', () => {
    // `u` reassigns every binding it destructures, so a partial array would reset the
    // props the parent did not send to their defaults — and `$a()` would repaint them.
    const src = hostChunk(
      '.label="Hola" .value="@count"',
      '@code {\n  const { label, value = 0 } = props<{ label: string; value?: number }>();\n}\n' +
        '<x-child>\n  <template shadowrootmode="open"><span>@label @value</span></template>\n</x-child>\n',
    );
    const hook = src.slice(src.indexOf('const $s = () => {'), src.indexOf('return {'));
    expect(hook).toContain('$n0.u([, , "Hola", count.peek()]);');
    expect(hook).toContain('$d.push(count.subscribe(($v) => { $n0.u([, , "Hola", $v]); }));');
  });

  it('leaves a hole where the host passes nothing, at either end of the array', () => {
    const two =
      '@code {\n  const { label = "x", value = 0 } = props<{ label?: string; value?: number }>();\n}\n' +
      '<x-child>\n  <template shadowrootmode="open"><span>@label @value</span></template>\n</x-child>\n';
    // A prop the host never names has no value the parent could send: the hole leaves the
    // child's own default in charge, which is the value it was built with in the first place.
    expect(hostChunk('.value="@count"', two)).toContain('$n0.u([, , , count.peek()]);');

    const flipped =
      '@code {\n  const { value = 0, label = "x" } = props<{ value?: number; label?: string }>();\n}\n' +
      '<x-child>\n  <template shadowrootmode="open"><span>@label @value</span></template>\n</x-child>\n';
    // Trailing holes are not written at all — an array that stops short says the same thing.
    expect(hostChunk('.value="@count"', flipped)).toContain('$n0.u([, , count.peek()]);');
  });

  it('subscribes once per signal, and each rebuilds the whole array', () => {
    const two =
      '@code {\n  const { a = 0, b = 0 } = props<{ a?: number; b?: number }>();\n}\n' +
      '<x-child>\n  <template shadowrootmode="open"><span>@a @b</span></template>\n</x-child>\n';
    const src = hostChunk('.a="@count" .b="@other"', two, '    const other = signal(1);\n');
    const hook = src.slice(src.indexOf('const $s = () => {'), src.indexOf('return {'));

    expect(hook).toContain('$n0.u([, , count.peek(), other.peek()]);');
    // The signal that notified hands its value in; the rest are read where they stand.
    expect(hook).toContain('$d.push(count.subscribe(($v) => { $n0.u([, , $v, other.peek()]); }));');
    expect(hook).toContain('$d.push(other.subscribe(($v) => { $n0.u([, , count.peek(), $v]); }));');
  });

  it('keeps the host itself untouched: still fabricated, still not driven', () => {
    const src = hostChunk('.value="@count"');
    expect(src).toContain('$n0 = $dom.element("x-child");');
    expect(src).toContain(`$dom.setAttr($n0, 'data-adopt', "x-child");`);
    expect(src).not.toContain('attachShadow'); // the runtime owns the child (SDD-17)
  });

  it('emits no channel at all when the value is not a signal (§6.6)', () => {
    // Decision 75 intact: a constant crosses once, it is already in the HTML the server
    // painted, and `const` is exactly its semantics. A channel would be scaffolding.
    const src = hostChunk('.value="@41"');
    expect(src).not.toContain('.u([');
    expect(src).not.toContain('.subscribe(');
    expect(src).toContain('const $s = () => {};');
  });

  it('does not mistake a plain local for a signal', () => {
    const src = hostChunk('.value="@plain"', CHILD, '    const plain = 7;\n');
    expect(src).not.toContain('.u([');
    expect(src).not.toContain('plain.peek()');
  });
});

/**
 * BUG-12 §2.5 — the factory closure is shared with the `@client` body, copied verbatim.
 * Every name the emit takes there is a name the author cannot use, and `m`/`s` are two of
 * the most plausible one-letter names there are.
 */
describe('emitComponentClientModule — the factory namespace (BUG-12 §6.10)', () => {
  it('survives a @client that declares const s and const m', () => {
    const src = inlineChunk(
      'x-collide',
      '@code {\n  @client {\n    import { signal } from \'@fudic/core\';\n' +
        '    const s = signal(0);\n    const m = 2;\n  }\n}\n' +
        '<x-collide>\n  <template shadowrootmode="open"><b>hi</b></template>\n</x-collide>\n',
    );
    expect(src).toContain('const s = signal(0);');
    expect(src).toContain('const m = 2;');
    // The chunk has to PARSE. Before BUG-12 this threw `SyntaxError: Identifier 'm' has
    // already been declared`, and the compiler emitted it without a single diagnostic.
    const body = src.replace(/^import .*$/gmu, '');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    expect(() => new Function('FudicElement', 'signal', 'customElements', body)).not.toThrow();
  });

  it('runs it: the collided names belong to the author, and keep their values', () => {
    const src = inlineChunk(
      'x-collide2',
      '@code {\n  @client {\n    const s = 41;\n    const m = 1;\n    globalThis.__fudSum = s + m;\n  }\n}\n' +
        '<x-collide2>\n  <template shadowrootmode="open"><b>hi</b></template>\n</x-collide2>\n',
    );
    const body = src.replace(/^import .*$/gmu, '');
    let captured: { c(props: readonly unknown[]): unknown } | undefined;
    const registry = { define: (_n: string, ctor: { c(p: readonly unknown[]): unknown }) => { captured = ctor; } };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function('FudicElement', 'customElements', body)(class {}, registry);
    captured!.c([{}, {}]);
    expect((globalThis as unknown as { __fudSum: number }).__fudSum).toBe(42);
  });
});

describe('emitComponentClientModule — event bindings hook up in $s() (§4.5)', () => {
  it('registers the listener and collects its teardown, guarded by the node', () => {
    const src = chunk('app-button');
    expect(src).toContain('$n0 && $d.push($dom.event($n0, "click", onClick));');
  });

  it('a listener inside a @foreach belongs to the row, not to the component', () => {
    const src = inlineChunk(
      'x-rows',
      '@code {\n  const { rows } = props<{ rows: { id: string }[] }>();\n' +
        '  @client {\n    function del(ev, id) { ev.preventDefault(); }\n  }\n}\n' +
        '<x-rows>\n  <template shadowrootmode="open"><ul>\n' +
        '    @foreach (const row of rows) key (row.id) {\n' +
        '      <li><button @click="@del($event, row.id)">x</button></li>\n' +
        '    }\n' +
        '  </ul></template>\n</x-rows>\n',
    );
    // The block function owns the hookup, so `$d` is the ROW's and `row` is its own
    // parameter: N rows give N subscriptions, and `r()` of a row takes its own away.
    expect(src).toMatch(
      /\$n\d+ && \$d\.push\(\$dom\.event\(\$n\d+, "click", \(\$event\) => del\(\$event, row\.id\)\)\);/u,
    );
    // And the component's own `$s` has nothing to do with it.
    expect(controller(src)).not.toContain('$dom.event');
  });
});

describe('emitComponentClientModule — bus subscriptions (§4.4, §6.23, §6.24)', () => {
  const cart = (tag: string, name: string): string =>
    inlineChunk(
      tag,
      '@code {\n  @client {\n' +
        "    import { emit } from '@fudic/dom';\n" +
        '    const EVENTOS = { carrito: \'carrito\' };\n' +
        '    function onCarrito(ev) { this.dataset.seen = ev.type; }\n' +
        "    function press() { emit('press', 1); }\n" +
        '  }\n}\n' +
        `<${tag}>\n  <template shadowrootmode="open">` +
        `<button ${name}="@onCarrito($event)" @click="@press()">x</button>` +
        `</template>\n</${tag}>\n`,
    );

  it('desugars to a document listener with the host as context, and keeps the disposer', () => {
    const src = cart('x-cart', 'bus:carrito');
    expect(src).toContain(
      '$d.push($dom.bus($host, "carrito", ($event) => onCarrito.call($host, $event)));',
    );
    // `@evento` and `bus:evento` are opposites (§6.24): one takes the node, the other the
    // host, and only the second reaches the document.
    expect(src).toContain('$d.push($dom.event($n0, "click", ($event) => press()));');
    expect(src).toContain('let $host = $dom.host($shadow);');
  });

  it('takes an expression name as an expression, evaluated where it subscribes (§6.22)', () => {
    // Not resolvable statically? Not an error, and the listener is emitted all the same:
    // what resolution decides is who enters `fud-bus`, and that is a fact about the page.
    const src = cart('x-cart2', 'bus:(EVENTOS.carrito)');
    expect(src).toContain(
      '$d.push($dom.bus($host, (EVENTOS.carrito), ($event) => onCarrito.call($host, $event)));',
    );
  });

  it('gives emit(...) its host, invisibly to the developer', () => {
    // The signature the author imports stays `(name, detail?)`; the host arrives as `this`.
    expect(cart('x-cart3', 'bus:carrito')).toContain(
      "function press() { emit.call($host, 'press', 1); }",
    );
  });
});

describe('emitComponentClientModule — `$event` outside a handler (§6.20.b)', () => {
  it('is a free identifier like any other, copied and never substituted', () => {
    const src = inlineChunk(
      'x-free',
      '<x-free>\n  <template shadowrootmode="open">' +
        '<span title="@($event)">@($event)</span></template>\n</x-free>\n',
    );
    // The compiler never rewrites `$event`: what it does is NAME the parameter of the arrow
    // it emits for an event binding. Outside that list the text means nothing special, and
    // the `$` reserve (§4.7) is what guarantees the author cannot have declared it either.
    expect(src).toContain('$v = ($event);');
    expect(src).toContain("String(($event) ?? '')");
    expect(src).not.toContain('($event) =>');
  });
});

describe('emitComponentClientModule — a value that cannot be subscribed (FUD0291)', () => {
  it('reports it with its span, skips the binding, and emits the rest', () => {
    const source =
      '@code {\n  @client {\n    const label = 1;\n  }\n}\n' +
      '<x-bad>\n  <template shadowrootmode="open"><button @click="@(1 + 2)">x</button></template>\n</x-bad>\n';
    const io = memoryIo({
      '/page.fud': '<link rel="component" href="./x-bad.fud">\n<html><head></head><body><x-bad></x-bad></body></html>\n',
      '/x-bad.fud': source,
    });
    const g = resolveComponents('/page.fud', io);
    const out = emitComponentClientModuleMapped(g, g.components.get('x-bad')!);
    const bad = out.diagnostics.find((d) => d.code === 'FUD0291')!;
    expect(bad).toBeDefined();
    expect(source.slice(bad.span.start, bad.span.end)).toBe('1 + 2');
    // The emit does not stop for it (§5): the button is still fabricated, unhooked.
    expect(out.code).toContain('$dom.element("button")');
    expect(out.code).not.toContain('$dom.event');
  });
});

describe('emitComponentClientModule — $host, materialized only where it is read (§4.4)', () => {
  const withEmit = (tag: string): string =>
    inlineChunk(
      tag,
      '@code {\n  @client {\n' +
        "    import { emit } from '@fudic/dom';\n" +
        "    function press() { emit('press'); }\n" +
        '  }\n}\n' +
        `<${tag}>\n  <template shadowrootmode="open"><b>hi</b></template>\n</${tag}>\n`,
    );

  it('declares it from the shadow root, and releases it in r()', () => {
    const src = withEmit('x-emitter');
    // From the adapter, not from a fourth position in `$props`: the shadow root already
    // carries its host on both branches, so nothing about the contract had to move.
    expect(src).toContain('let $host = $dom.host($shadow);');
    expect(controller(src)).toContain('$shadow = $host = null;');
  });

  it('emits nothing at all for a component that neither emits nor subscribes', () => {
    // A chunk under 1 kB is what keeps INP flat on a cache miss (§3.7): a reference nobody
    // reads is not free, it is a line every instance of the tag downloads.
    // `app-card` has a listener of its own and still needs no host: a `@evento` takes the
    // node, and only a `bus:` or an `emit` reaches for the host.
    expect(chunk('app-card')).not.toContain('$host');
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
