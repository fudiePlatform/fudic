/**
 * Block render (SDD-30) — the shapes `client.test.ts` does not reach.
 *
 * That suite covers the two constructs the fixtures happen to use: a `@foreach` inside an
 * element, and an `@if` chain. This one takes the rest of the surface the spec defines —
 * `@switch`, `@while`, `@for`, a block whose body holds another block, a block at the ROOT
 * level (where the mount is deferred), the one marker §3.4 admits, and the two headers that
 * declare nothing — because those are where the emit stops being one shape repeated and
 * starts being decisions.
 *
 * Asserted on the emitted text: the byte-for-byte lock is `golden.test.ts`, and the DOM
 * behaviour is the hydrate harness. What is checked here is the codegen's own choices.
 */
import { describe, expect, it } from 'vitest';
import {
  resolveComponents,
  emitComponentClientModule,
  emitComponentClientModuleMapped,
  type EmitOutput,
} from '../../src/emit/index.js';
import { collectTemplateJs } from '../../src/emit/constructs.js';
import { parseDocument } from '../../src/html/index.js';
import { parseControl } from '../../src/control/index.js';
import { parseCodeBlock } from '../../src/code/index.js';
import { parseDirective } from '../../src/layout/index.js';
import { structureDocument, type RouteDocument } from '../../src/document/index.js';
import { layoutFixture, memoryIo } from './_support.js';

/** A one-component graph from an in-memory page that links it. */
function emitted(tag: string, component: string): EmitOutput {
  const io = memoryIo({
    '/page.fud': `<link rel="component" href="./${tag}.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
    [`/${tag}.fud`]: component,
  });
  const graph = resolveComponents('/page.fud', io);
  return emitComponentClientModuleMapped(graph, graph.components.get(tag)!);
}

const chunk = (tag: string, component: string): string => emitted(tag, component).code;

/** A component whose shadow root holds `markup`, with `code` in front of it. */
const component = (tag: string, code: string, markup: string): string =>
  `${code}<${tag}>\n  <template shadowrootmode="open">${markup}</template>\n</${tag}>\n`;

const codes = (out: EmitOutput): string[] => out.diagnostics.map((d) => d.code);

/**
 * The six criteria of §6 that are checkable on the text alone: what a block IS, what it
 * takes, in what order, and what the emit refuses to put in the DOM.
 */
describe('the shape of a block (§6.1–§6.6)', () => {
  // The example of §3.3, verbatim: it is the one the spec pins a signature to.
  const EXAMPLE = component(
    'x-ex',
    '@code {\n' +
      '  const { rows } = props<{ rows: { id: string; name: string }[] }>();\n' +
      '  @client {\n' +
      "    let a = 'Hello';\n" +
      '    const pick = (id) => (e) => { console.log(id); };\n' +
      '  }\n' +
      '}\n',
    '<ul>@foreach (const { id, name } of rows) key (id) {' +
      '<li><span data-a="@a">@name</span><button @click="@pick(id)">elegir</button></li>' +
      '}</ul>',
  );

  it('§6.1 — every block is a function returning the whole interface', () => {
    const src = chunk(
      'x-iface',
      component(
        'x-iface',
        '@code {\n  const { on } = props<{ on: boolean }>();\n}\n',
        '<div>@if (on) {<b></b>} else {<i></i>}</div>',
      ),
    );
    // Two arms, two functions, declared inside `static c($props)`. The component's own
    // controller is the LAST `return {` of the chunk; everything above it is the blocks.
    const blocks = src.slice(0, src.lastIndexOf('return {'));
    expect(blocks.match(/const \$b\d = \(\$parent, \$anchor[^)]*\) => \{/gu)).toHaveLength(2);
    for (const member of [
      'key: undefined,',
      'c: () => {',
      'h: ($c) => {',
      'm: ($ref = $anchor) => {',
      's: $s,',
      'u: () => {',
      'move: ($ref) => {',
      'r: () => {',
    ]) {
      expect(blocks.split(member)).toHaveLength(3); // two occurrences ⇒ three pieces
    }
  });

  it('§6.2 — the parameters are exactly the dependencies of §3.3', () => {
    // `pick` is a `const` nobody reassigns — closure, not signature. `rows` is consumed by
    // the header, which runs in the PARENT. `a` is a mutable `@client` the body reads.
    expect(chunk('x-ex', EXAMPLE)).toContain('const $b0 = ($parent, $anchor, id, name, a) => {');
  });

  it('§6.3 — the same source gives the same signature, in the order of the pattern', () => {
    expect(chunk('x-ex', EXAMPLE)).toBe(chunk('x-ex', EXAMPLE));
    // `{ id, name }` yields `id` then `name`, and never the other way round.
    const swapped = EXAMPLE.replace('const { id, name } of', 'const { name, id } of');
    expect(chunk('x-ex', swapped)).toContain('($parent, $anchor, name, id, a)');
  });

  it('§6.4 — a nested block inherits the iteration variables of every ancestor', () => {
    const src = chunk(
      'x-deep',
      component(
        'x-deep',
        '@code {\n  const { rows } = props<{ rows: { id: string; cs: { c: string }[] }[] }>();\n}\n',
        '<ul>@foreach (const row of rows) key (row.id) {' +
          '<li>@foreach (const cell of row.cs) key (cell.c) {' +
          '<b>@if (cell.c) {<i>@row.id @cell.c</i>}</b>' +
          '}</li>}</ul>',
      ),
    );
    expect(src).toContain('const $b0 = ($parent, $anchor, row) => {'); // outer loop
    expect(src).toContain('const $b1 = ($parent, $anchor, cell, row) => {'); // inner: both
    // The `@if` declares nothing at all and still receives the two it reads.
    expect(src).toContain('const $b2 = ($parent, $anchor, row, cell) => {');
  });

  it('§6.5 — no marker in the DOM but the one §3.4 forces', () => {
    const plain = chunk(
      'x-nomark',
      component(
        'x-nomark',
        '@code {\n  const { rows, on } = props<{ rows: string[]; on: boolean }>();\n}\n',
        '<ul>@foreach (const r of rows) key (r) {<li>@r</li>}@if (on) {<li></li>}</ul>',
      ),
    );
    expect(plain).not.toContain('$dom.comment');
  });

  it('§6.6 — every name the emit introduces starts with $, except the author’s', () => {
    const src = chunk('x-ex', EXAMPLE);
    const factory = src.slice(src.indexOf('static c($props)'));
    // The names that are the AUTHOR's: their props, their `@client` bindings, and what the
    // loop header declares. Everything else in the factory was written by the emit.
    const authors = new Set(['rows', 'a', 'pick', 'id', 'name']);
    const declared = [...factory.matchAll(/^\s*(?:let|const) ([^=;]+?)\s*=/gmu)]
      .flatMap(([, names]) => names!.split(',').map((n) => n.replace(/[[\]{}]/gu, '').trim()))
      .filter((n) => n !== '');
    expect(declared.length).toBeGreaterThan(0);
    expect(declared.filter((n) => !n.startsWith('$') && !authors.has(n))).toEqual([]);
    // And the dependency parameters are the author's, which is the one exception (§4.7).
    expect(factory).toContain('($parent, $anchor, id, name, a)');
  });
});

describe('@switch — one block per case, one selector for all of them', () => {
  const src = chunk(
    'x-switch',
    component(
      'x-switch',
      '@code {\n  const { kind } = props<{ kind: string }>();\n}\n',
      "<div>@switch (kind) { case 'a': <p>@kind</p> case 'b': <b></b> default: <i></i> }</div>",
    ),
  );

  it('turns the discriminant into a closure that returns the branch INDEX', () => {
    // The `switch` is written once and read by `c`, `h` and `u` alike: three copies of the
    // same conditions are three chances for the three bodies to disagree on the branch.
    expect(src).toContain(
      "const $q0 = () => { switch (kind) { case 'a': return 0; case 'b': return 1; default: return 2; } return -1; };",
    );
  });

  it('gives every case its own block, and only the one that reads a value takes it', () => {
    expect(src).toContain('const $b0 = ($parent, $anchor, kind) => {');
    expect(src).toContain('const $b1 = ($parent, $anchor) => {');
    expect(src).toContain('const $b2 = ($parent, $anchor) => {');
    // Which arguments an update carries depends on which arm is alive — two arms share
    // neither nodes nor signature (§4.1).
    expect(src).toContain(
      'const $g0 = ($x, $i) => { if ($x === 0) $i.u(kind); else if ($x === 1) $i.u(); else if ($x === 2) $i.u(); };',
    );
  });

  it('carries no key at all: its identity is the branch taken (§3.5)', () => {
    expect(src).toContain('key: undefined,');
    expect(src).not.toContain('$prev'); // no reconciliation: zero or one instance
  });
});

describe('@while and @for — the two loops the fixtures never write', () => {
  it('splices a @while header whole, and declares nothing of its own', () => {
    const src = chunk(
      'x-while',
      component(
        'x-while',
        '@code {\n  @client {\n    let cur = head;\n  }\n}\n',
        '<ul>@while (cur !== null) key (cur.id) { <li>x</li> }</ul>',
      ),
    );
    expect(src).toContain('while (cur !== null) {');
    // `@while` binds no iteration variable (§3.5), so the only parameter is the mutable
    // `@client` binding its body walks — and its key comes from what that body mutates.
    expect(src).toContain('const $b0 = ($parent, $anchor, cur) => {');
    expect(src).toContain('key: cur.id,');
  });

  it('reads the bindings of a classic @for out of the `init` of its header', () => {
    const src = chunk(
      'x-for',
      component(
        'x-for',
        '@code {\n  const { n } = props<{ n: number }>();\n}\n',
        '<ol>@for (let i = 0; i < n; i++) key (i) { <li>@i</li> }</ol>',
      ),
    );
    expect(src).toContain('for (let i = 0; i < n; i++) {');
    expect(src).toContain('const $b0 = ($parent, $anchor, i) => {');
    expect(src).toContain('key: i,');
  });

  it('writes no argument list at all for a loop nothing changeable reaches', () => {
    const src = chunk(
      'x-const',
      component(
        'x-const',
        '@code {\n  @client {\n    const rows = [1, 2];\n  }\n}\n',
        '<ul>@while (rows.length > 9) key (rows) { <li>x</li> }</ul>',
      ),
    );
    // `rows` is a `const` nobody reassigns: it reaches the block through the closure, so
    // the signature is the two structural parameters and nothing else (§3.3).
    expect(src).toContain('const $b0 = ($parent, $anchor) => {');
    expect(src).toContain('const $i = $b0($n0, null);');
    expect(src).toContain('const $i = $b0($n0, null); $i.c(); $i.m(); $i.s(); $next.push($i);');
    expect(src).toContain('u: () => { $a(); },');
  });
});

describe('a block whose body holds another block', () => {
  const src = chunk(
    'x-nest',
    component(
      'x-nest',
      '@code {\n  const { rows } = props<{ rows: { id: string; on: boolean }[] }>();\n}\n',
      '<ul>@foreach (const row of rows) key (row.id) {@if (row.on) { <li></li> }}</ul>',
    ),
  );

  it('declares the inner block inside the outer one, with its own registry', () => {
    // The inner block is declared in the closure of the block that holds it, so its
    // registry is per ROW and not per component (§3.6).
    const outer = src.slice(src.indexOf('const $b0 ='));
    expect(outer.indexOf('let $k1 = [];')).toBeLessThan(outer.indexOf('const $b1 ='));
    expect(src).toContain('$k1.forEach(($i) => $i.r());'); // the row retires its own blocks
  });

  it("reconciles the inner construct from the outer block's own u", () => {
    expect(src).toContain('u: (...$p) => { [row] = $p; $a(); $u1(); },');
  });

  it('mounts the inner block from the row’s m, ante the row’s own anchor', () => {
    // A block body is not a DOM level: its nodes are the parent's children, so a construct
    // written directly in it is mounted with the rest of the row, not while `c` fabricates.
    expect(src).toContain('for (const $i of $k1) $i.m($anchor);');
  });

  it('unrolls the inner rows in move, because they are as much the row as its nodes', () => {
    expect(src).toContain(
      'for (let $j = $k1.length - 1; $j >= 0; $j -= 1) $ref = $k1[$j].move($ref);',
    );
  });
});

describe('a block at the ROOT level: the mount is deferred and the anchor arrives late', () => {
  const src = chunk(
    'x-root',
    component(
      'x-root',
      '@code {\n  const { rows } = props<{ rows: string[] }>();\n}\n',
      '@foreach (const r of rows) key (r) { <p>@r</p> }<hr>',
    ),
  );

  it('builds the rows during c with NO anchor, and mounts them from $m', () => {
    // The siblings of a root are collected in `$r` and only reach the tree when `$m` runs.
    // A row inserted during `c` would land ahead of every one of them.
    expect(src).toContain('const $i = $b0($shadow, null, r);');
    expect(src).not.toContain('$i.m();\n');
  });

  it('hands the anchor to m() at MOUNT time, when the variable finally holds a node', () => {
    // `$n0` is the `<hr>`, and the walk assigns it AFTER the loop it anchors. Read while
    // `c` ran it would be `undefined`, and `$dom.before(undefined, …)` is a crash.
    expect(src).toContain('for (const $i of $k0) $i.m($n0);');
    expect(src).toContain('m: ($ref = $anchor) => {');
    expect(src).toContain('$anchor = $ref;');
  });

  it('reconciles against that same anchor, which by then is just a node', () => {
    expect(src).toContain('const $i = $b0($shadow, $n0, r); $i.c(); $i.m(); $i.s();');
    expect(src).toContain('for (let $j = $next.length - 1, $ref = $n0; $j >= 0; $j -= 1)');
  });
});

describe('the one marker the DOM gets (§3.4)', () => {
  const marked = (markup: string): string =>
    chunk(
      'x-mark',
      component(
        'x-mark',
        '@code {\n  const { a, b, on } = props<{ a: string; b: string; on: boolean }>();\n}\n',
        markup,
      ),
    );

  it('plants an empty comment between two interpolated runs a block separates', () => {
    const src = marked('<div>@a @if (on) { <b></b> } @b</div>');
    // With the block closed the two runs are ONE text node coming back from HTML, and no
    // traversal can tell them apart. The comment is the boundary the markup lost.
    expect(src).toContain("$n3 = $dom.comment('');");
    expect(src).toContain('$n1 = $dom.firstChild($n0);'); // reached forward, not backward
    expect(src).toContain('$n3 = $dom.nextSibling($n1);');
  });

  it('steps the marked run from the node before it when there is one', () => {
    const src = marked('<div><i></i>@a @if (on) { <b></b> } @b</div>');
    expect(src).toContain('$n2 = $dom.nextSibling($n1);');
    expect(src).toContain("$n4 = $dom.comment('');");
  });

  it('gives the marker a reference of its own inside a block, so r() takes it away', () => {
    const src = marked('<ul>@foreach (const r of [1]) key (r) {@a @if (on) { <b></b> } @b}</ul>');
    expect(src).toContain('$r.push($n4);'); // the comment, tracked like every other root
  });

  it('writes none when the two runs are separated by an ELEMENT', () => {
    const src = marked('<div>@a <i></i> @b</div>');
    expect(src).not.toContain('$dom.comment');
  });

  it('writes none when what follows the block is not an interpolated run', () => {
    expect(marked('<div>@a @if (on) { <b></b> } <i></i></div>')).not.toContain('$dom.comment');
    expect(marked('<div>@a @if (on) { <b></b> } plain</div>')).not.toContain('$dom.comment');
  });

  it('writes none when the run in front cannot be reached forward either', () => {
    // The comment before it is not in the DOM the server painted, so there is no node to
    // step from — and backwards the walk would run into whatever the block rendered.
    expect(marked('<div><!-- x -->@a @if (on) { <b></b> } @b</div>')).not.toContain('$dom.comment');
  });
});

describe('the registry, and the index the reconciliation walks (§3.6, §4.4)', () => {
  const list = chunk(
    'x-reg',
    component(
      'x-reg',
      '@code {\n  const { rows } = props<{ rows: { id: string }[] }>();\n}\n',
      '<ul>@foreach (const row of rows) key (row.id) {<li>@row.id</li>}</ul>',
    ),
  );

  it('gives every construct one registry, and r() of the component walks it', () => {
    expect(list).toContain('let $k0 = [];');
    expect(list).toContain('$k0.forEach(($i) => $i.r());');
  });

  it('builds the index by hand, so the FIRST of two equal keys wins', () => {
    // `new Map(entries)` would keep the last — the opposite rule — and, worse, the instance
    // that lost the slot would be reachable from nowhere: nothing would ever call its `r()`
    // and its nodes would pile up one per update. That is the leak §1 exists to close.
    expect(list).toContain('const $prev = new Map();');
    expect(list).toContain(
      'for (const $i of $k0) { if ($prev.has($i.key)) $gone.push($i); else $prev.set($i.key, $i); }',
    );
    expect(list).toContain('for (const $i of $prev.values()) $gone.push($i);');
    expect(list).toContain('for (const $i of $gone) $i.r();');
  });

  it('uses the same registry for an @if, with zero or one instance in it', () => {
    // No second mechanism: what a branching construct keeps is which arm is live (`$x0`),
    // and the instance itself sits in the same list a loop would use.
    const branch = chunk(
      'x-one',
      component(
        'x-one',
        '@code {\n  const { on } = props<{ on: boolean }>();\n}\n',
        '<div>@if (on) {<b></b>}</div>',
      ),
    );
    expect(branch).toContain('let $k0 = [];');
    expect(branch).toContain('let $x0 = -1;');
    expect(branch).toContain('for (const $i of $k0) $i.r();');
    expect(branch).not.toContain('$prev'); // nothing to reconcile by key
  });
});

describe('a child component built inside a block (§4.6)', () => {
  const src = ((): string => {
    const io = memoryIo({
      '/page.fud':
        '<link rel="component" href="./x-host.fud">\n' +
        '<html><head></head><body><x-host></x-host></body></html>\n',
      '/x-host.fud':
        '<link rel="component" href="./x-child.fud">\n' +
        '@code {\n  const { rows } = props<{ rows: string[] }>();\n  @client {\n' +
        "    import { signal } from '@fudic/core';\n    const count = signal(0);\n  }\n}\n" +
        '<x-host>\n  <template shadowrootmode="open">' +
        '<ul>@foreach (const r of rows) key (r) {<li><x-child .value="@count"></x-child></li>}</ul>' +
        '</template>\n</x-host>\n',
      '/x-child.fud':
        '@code {\n  const { value = 0 } = props<{ value?: number }>();\n}\n' +
        '<x-child>\n  <template shadowrootmode="open"><span>@value</span></template>\n</x-child>\n',
    });
    const graph = resolveComponents('/page.fud', io);
    return emitComponentClientModule(graph, graph.components.get('x-host')!);
  })();

  it('hooks the row’s own child up in the BLOCK’s $s, with the disposer in its $d', () => {
    // The row is where the child lives and where it dies: one initial pass and one
    // subscription per row, registered in the block that built it (BUG-12 §7).
    const block = src.slice(src.indexOf('const $b0 ='), src.indexOf('const $u0 ='));
    expect(block).toContain('const $s = () => {');
    expect(block).toContain('$n2.u([, , count()]);');
    expect(block).toContain('$d.push($sub(count, ($v) => { $n2.u([, , $v]); }));');
    // And retiring the row runs them: `r()` empties `$d` before it takes the nodes away.
    expect(block).toContain('r: () => { $d.forEach(($f) => $f());');
  });

  it('reaches the parent’s signal through the closure, not through the signature', () => {
    // `count` is a `const` nobody reassigns: an update would have nothing new to hand it.
    expect(src).toContain('const $b0 = ($parent, $anchor, r) => {');
  });
});

describe('FUD0543 — a loop header that names nothing', () => {
  it('fires when the header assigns to an outer binding instead of declaring', () => {
    const out = emitted(
      'x-nodecl',
      component(
        'x-nodecl',
        '@code {\n  const { rows } = props<{ rows: string[] }>();\n  @client {\n    let r = "";\n  }\n}\n',
        '<ul>@foreach (r of rows) key (r) { <li>@r</li> }</ul>',
      ),
    );
    expect(codes(out)).toEqual(['FUD0543']);
    // And the emit goes on: the rest of the page is still emitted (§5).
    expect(out.code).toContain('for (r of rows) {');
  });

  it('fires when the header did not parse at all, and does not stop the emit', () => {
    const out = emitted(
      'x-nohead',
      component(
        'x-nohead',
        '@code {\n  const { rows } = props<{ rows: string[] }>();\n}\n',
        '<ul>@foreach const r of rows { <li>x</li> }</ul>',
      ),
    );
    expect(codes(out)).toEqual(['FUD0543']);
    expect(out.code).toContain('customElements.define("x-nohead"');
  });

  it('never fires for a @while, which declares nothing by design (§3.5)', () => {
    const out = emitted(
      'x-whilekey',
      component(
        'x-whilekey',
        '@code {\n  @client {\n    let cur = head;\n  }\n}\n',
        '<ul>@while (cur !== null) key (cur.id) { <li>x</li> }</ul>',
      ),
    );
    expect(codes(out)).toEqual([]);
  });
});

describe('collectTemplateJs — every fragment the template evaluates, in source order', () => {
  it('reads the JS of an expression attribute name, a @raw and an inline @{ … }', () => {
    const tag = 'x-frag';
    const src = component(
      tag,
      '@code {\n  const { html, rows } = props<{ html: string; rows: string[] }>();\n' +
        '  @client {\n    const EV = { cart: "c" };\n    const onCart = () => {};\n  }\n}\n',
      '<ul>@foreach (const r of rows) key (r) {' +
        '<li bus:(EV.cart)="@onCart">@{ const up = r; }@raw(html)</li>}</ul>',
    );
    // `html` is only ever named inside `@raw(...)`, and `EV` only inside the attribute NAME:
    // if either walk were missing, the block's signature would fall short of its body.
    expect(chunk(tag, src)).toContain('const $b0 = ($parent, $anchor, r, html) => {');
  });

  it('descends into a @section, whose children are markup like any other', () => {
    // A section is lifted out of a route's markup (SDD-21), but it is still part of the
    // tree the document evaluates: the `@data.title` inside it is a fragment like any
    // other, and a walk that stopped at the section would leave it with no AST.
    const source = layoutFixture('blog.fud');
    const parsed = parseDocument(source, {
      atConstructs: { parseControl, parseCodeBlock, parseDirective },
    });
    const route = structureDocument(source, parsed.value).value as RouteDocument;
    const kinds: string[] = [];
    collectTemplateJs([route.sections[0]! as unknown as never], (kind) => kinds.push(kind));
    expect(kinds).toEqual(['expression']);
  });
});
