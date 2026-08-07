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

  it('returns exactly {c, h, u, r}: $m, $s and $a are closures (§6.11, BUG-12 §3.3)', () => {
    expect(src).toContain('const $m = () =>');
    expect(src).toContain('const $s = () => {};');
    expect(src).toContain('const $a = () => {');
    expect(src).toMatch(/return \{\n\s+c: \(\) => \{/u);
    expect(src).toContain('h: () => {');
    expect(src).toContain('u: ($p) => {');
    expect(src).toContain('r: () => {');
    expect(src).not.toMatch(/^\s+[msa]: /mu);
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
    const create = src.slice(src.indexOf('c: () => {'), src.indexOf('h: () => {'));
    const hydrate = src.slice(src.indexOf('h: () => {'), src.indexOf('u: ($p) => {'));
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
    const hydrate = src.slice(src.indexOf('h: () => {'), src.indexOf('r: () => {'));
    expect(hydrate).toContain('} else {');
    expect(hydrate).toContain('$n1 = $c1; $c1 = $dom.nextElementSibling($c1);');
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
  const between = (from: string, to: string): string =>
    src.slice(src.indexOf(from), src.indexOf(to));

  it('routes every value write through $a(), the single place a value reaches a node (§6.3)', () => {
    expect(src).toContain('const $a = () => {');
    expect(src).toContain('$dom.setText($n3, $v);');
    expect(src).toContain(`$dom.setAttr($n0, 'class', $v);`);
    // The fabricate body creates the node and nothing else: the value is `$a`'s.
    expect(src).toContain('$n3 = $dom.text(\'\');');
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

  it('reassigns with the two leading holes empty and the defaults kept (§6.4)', () => {
    // `$dom` and `$shadow` are never reassigned: an update carries state, not the adapter.
    // The defaults are repeated because an update may bring `undefined` back.
    expect(src).toContain("u: ($p) => { [, , title, variant = 'default'] = $p; $a(); },");
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

  it('re-applies inside the branch that owns the write, not outside it', () => {
    const src2 = inlineChunk(
      'x-cond',
      '@code {\n  const { on, name } = props<{ on: boolean; name: string }>();\n}\n' +
        '<x-cond>\n  <template shadowrootmode="open">' +
        '@if (on) { <b title="@name"></b> }' +
        '</template>\n</x-cond>\n',
    );
    const apply = src2.slice(src2.indexOf('const $a = () => {'), src2.indexOf('return {'));
    // `$n0` only exists when the branch rendered, so the guard travels with the write.
    expect(apply).toContain('if (on) {');
    expect(apply).toContain('$dom.setAttr($n0, "title", String($v));');
  });

  it('replicates the whole chain when the write is a bare interpolation in a branch', () => {
    const src2 = inlineChunk(
      'x-branch',
      '@code {\n  const { on, name } = props<{ on: boolean; name: string }>();\n}\n' +
        '<x-branch>\n  <template shadowrootmode="open">' +
        '@if (on) { @name } else { nada }' +
        '</template>\n</x-branch>\n',
    );
    const apply = src2.slice(src2.indexOf('const $a = () => {'), src2.indexOf('return {'));
    // The `else` is written even though it applies nothing: the branches of one `@if` are
    // one statement, and half a statement does not parse.
    expect(apply).toContain('if (on) {');
    expect(apply).toContain('} else {');
    expect(apply).toContain('$dom.setText($n0, $v);');
  });

  it('sees a class: binding inside a branch as a write of its own', () => {
    const src2 = inlineChunk(
      'x-clsif',
      '@code {\n  const { on } = props<{ on: boolean }>();\n}\n' +
        '<x-clsif>\n  <template shadowrootmode="open">' +
        '@if (on) { <b class:hot="@on"></b> }' +
        '</template>\n</x-clsif>\n',
    );
    const apply = src2.slice(src2.indexOf('const $a = () => {'), src2.indexOf('return {'));
    expect(apply).toContain('if (on) {');
    expect(apply).toContain(`$dom.setAttr($n0, 'class', $v);`);
  });

  it('leaves a write inside a @foreach fused with its node, out of $a', () => {
    const src2 = inlineChunk(
      'x-loop',
      '@code {\n  const { items } = props<{ items: string[] }>();\n}\n' +
        '<x-loop>\n  <template shadowrootmode="open">' +
        '<ul>@foreach (const item of items) {<li>@item</li>}</ul>' +
        '</template>\n</x-loop>\n',
    );
    // A loop variable is not a stable reference — it holds the LAST node of the run — so
    // there is nothing for `$a` to write to. Updating a loop needs the block render that
    // BUG-12 §7 leaves to its own SDD; until then the value rides its creation.
    expect(src2).toContain("$n2 = $dom.text(String((item) ?? ''));");
    expect(src2).toContain('const $a = () => {};');
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
