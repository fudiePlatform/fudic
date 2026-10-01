/**
 * SDD-49 §6, criteria 15–29 — the prune of every sheet of one page (`src/emit/prune.ts`).
 *
 * Rules against the surface of their scope, tokens against the whole page. Every case builds
 * the surface by hand: what a scope holds is `surface.test.ts`'s business, and here the only
 * question is what a sheet keeps given one.
 */

import { describe, expect, it } from 'vitest';
import { flattenImports, plainSheet, type FlatSheet } from '../../src/css/index.js';
import {
  prunePage,
  projectSheetDiagnostics,
  sheetDiagnostics,
  type PageSheet,
  type PrunedSheet,
} from '../../src/emit/prune.js';
import { compactProjectCss } from '../../src/emit/project-styles.js';
import type { ScopeSurface, StyleScope } from '../../src/emit/surface.js';

interface SurfaceSpec {
  readonly tags?: readonly string[];
  readonly classes?: readonly string[];
  readonly ids?: readonly string[];
  readonly attributes?: Readonly<Record<string, readonly string[] | null>>;
  readonly openClasses?: boolean;
  readonly openIds?: boolean;
  readonly slotted?: ScopeSurface | null;
  readonly parts?: readonly string[] | 'any';
}

/** A surface from plain lists: everything absent is empty. */
function surface(spec: SurfaceSpec = {}): ScopeSurface {
  return {
    tags: new Set(spec.tags ?? []),
    classes: new Set(spec.classes ?? []),
    ids: new Set(spec.ids ?? []),
    attributes: new Map(
      Object.entries(spec.attributes ?? {}).map(([k, v]) => [k, v === null ? null : new Set(v)] as const),
    ),
    openClasses: spec.openClasses ?? false,
    openIds: spec.openIds ?? false,
    slotted: spec.slotted ?? null,
    parts: spec.parts === undefined ? new Set() : spec.parts === 'any' ? 'any' : new Set(spec.parts),
  };
}

interface One {
  readonly scope?: StyleScope;
  readonly surface?: ScopeSurface;
  readonly consumers?: readonly string[];
}

/** One plain sheet pruned alone on a page. */
function prune(css: string, one: One = {}): PrunedSheet {
  return pruneSheet(plainSheet('./a.css', css), one);
}

function pruneSheet(sheet: FlatSheet, one: One = {}): PrunedSheet {
  const page: PageSheet = {
    key: 'k',
    sheet,
    scope: one.scope ?? 'document',
    surface: one.surface ?? surface(),
  };
  const out = prunePage([page], one.consumers ?? []);
  expect(out.diagnostics).toEqual([]);
  return out.value[0]!;
}

/** The CSS kept of `css`, alone on a page. */
const kept = (css: string, one: One = {}): string => prune(css, one).css;

describe('rules against the surface (criteria 15–18)', () => {
  it('15 — a list keeps the selectors that match, and a rule with none goes', () => {
    const s = surface({ tags: ['h1', 'p'] });
    expect(kept('h1, h2, h3 { color: red }\ntable { border: 0 }', { surface: s })).toBe('h1{color:red}');
  });

  it('16 — a combinator is not checked: each compound against some element', () => {
    const s = surface({ tags: ['ul', 'li'] });
    expect(kept('ul > li { margin: 0 }', { surface: s })).toBe('ul > li{margin:0}');
    expect(kept('ol > li { margin: 0 }', { surface: s })).toBe('');
  });

  it('17 — state and structure pseudo-classes, `:not()` and `:has()` restrict nothing', () => {
    const s = surface({ tags: ['a', 'li'], classes: ['btn'] });
    expect(
      kept('.btn:hover { a: 1 }\na:not(.x) { b: 2 }\nli:nth-child(2n) { c: 3 }\np:hover { d: 4 }', { surface: s }),
    ).toBe('.btn:hover{a:1}a:not(.x){b:2}li:nth-child(2n){c:3}');
  });

  it('18 — in a shadow: `:host` always, `:root`/`html`/`body` never', () => {
    const css = ':host { a: 1 }\n:host(.x) { b: 2 }\n:host-context(.y) { c: 3 }\n:root { d: 4 }\nhtml { e: 5 }\nbody { f: 6 }';
    expect(kept(css, { scope: 'shadow' })).toBe(':host{a:1}:host(.x){b:2}:host-context(.y){c:3}');
  });

  it('18 — in the document: `:root`/`html`/`body` always, `:host` never', () => {
    const css = ':host { a: 1 }\n:root { d: 4 }\nhtml { e: 5 }\nbody { f: 6 }';
    expect(kept(css)).toBe(':root{d:4}html{e:5}body{f:6}');
  });

  it('18 — `::slotted()` against what the scope’s hosts project, and never without it', () => {
    const css = '::slotted(p) { a: 1 }\n::slotted(.x) { b: 2 }';
    const slotted = surface({ tags: ['p'] });
    expect(kept(css, { scope: 'shadow', surface: surface({ slotted }) })).toBe('::slotted(p){a:1}');
    expect(kept(css, { scope: 'shadow' })).toBe('');
    // In the document there is no shadow root to project into.
    expect(kept(css, { surface: surface({ slotted }) })).toBe('');
  });

  it('18 — `::part()` against the parts the page exposes, or anything when one is open', () => {
    const css = 'x-a::part(label) { a: 1 }\nx-a::part(label icon) { b: 2 }\nx-a::part(other) { c: 3 }';
    const tags = ['x-a'];
    expect(kept(css, { surface: surface({ tags, parts: ['label', 'icon'] }) })).toBe(
      'x-a::part(label){a:1}x-a::part(label icon){b:2}',
    );
    expect(kept(css, { surface: surface({ tags, parts: 'any' }) })).toBe(
      'x-a::part(label){a:1}x-a::part(label icon){b:2}x-a::part(other){c:3}',
    );
  });

  it('`::placeholder` needs a text field in the scope', () => {
    const css = '::placeholder { a: 1 }\n.f::placeholder { b: 2 }';
    expect(kept(css, { surface: surface({ classes: ['f'] }) })).toBe('');
    expect(kept(css, { surface: surface({ tags: ['input'], classes: ['f'] }) })).toBe(
      '::placeholder{a:1}.f::placeholder{b:2}',
    );
    expect(kept(css, { surface: surface({ tags: ['textarea'] }) })).toBe('::placeholder{a:1}');
  });

  it('classes and ids, unless an expression opened them', () => {
    const css = '.a { x: 1 }\n.b { x: 2 }\n#i { y: 1 }\n#j { y: 2 }';
    expect(kept(css, { surface: surface({ classes: ['a'], ids: ['i'] }) })).toBe('.a{x:1}#i{y:1}');
    expect(kept(css, { surface: surface({ openClasses: true, openIds: true }) })).toBe(
      '.a{x:1}.b{x:2}#i{y:1}#j{y:2}',
    );
  });

  it('`:is()`, `:where()`, `:matches()` keep when some argument matches', () => {
    const s = surface({ tags: ['p'] });
    expect(kept(':is(p, q) { a: 1 }\n:where(q, r) { b: 2 }\n:matches(p) { c: 3 }', { surface: s })).toBe(
      ':is(p, q){a:1}:matches(p){c:3}',
    );
  });

  it('a prelude the selector reader does not understand keeps the rule whole', () => {
    expect(kept('ns|a { a: 1 }')).toBe('ns|a{a:1}');
  });
});

describe('attribute selectors', () => {
  const attrs = { type: ['text', 'a b', 'en-US'], lang: null };
  const s = surface({ attributes: attrs });
  const keeps = (sel: string): boolean => kept(`${sel} { a: 1 }`, { surface: s }) !== '';

  it('by name alone, and not when the name is absent', () => {
    expect(keeps('[type]')).toBe(true);
    expect(keeps('[href]')).toBe(false);
    expect(keeps('[href="x"]')).toBe(false);
  });

  it('a value written from an expression matches any value', () => {
    expect(keeps('[lang="zz"]')).toBe(true);
  });

  it('each operator against the literal values seen', () => {
    expect(keeps('[type="text"]')).toBe(true);
    expect(keeps('[type="none"]')).toBe(false);
    expect(keeps('[type~="b"]')).toBe(true);
    expect(keeps('[type~="c"]')).toBe(false);
    expect(keeps('[type|="en"]')).toBe(true);
    expect(keeps('[type|="text"]')).toBe(true);
    expect(keeps('[type|="fr"]')).toBe(false);
    expect(keeps('[type^="te"]')).toBe(true);
    expect(keeps('[type^="zz"]')).toBe(false);
    expect(keeps('[type$="US"]')).toBe(true);
    expect(keeps('[type$="zz"]')).toBe(false);
    expect(keeps('[type*="ex"]')).toBe(true);
    expect(keeps('[type*="zz"]')).toBe(false);
  });

  it('an empty value matches nothing with `^=`, `$=` and `*=`', () => {
    expect(keeps('[type^=""]')).toBe(false);
    expect(keeps('[type$=""]')).toBe(false);
    expect(keeps('[type*=""]')).toBe(false);
  });
});

describe('at-rules (criterion 19)', () => {
  it('a grouping block keeps what matches inside it, and goes when nothing does', () => {
    const s = surface({ tags: ['p'] });
    expect(kept('@media screen { p { a: 1 } q { b: 2 } }\n@supports (x: y) { q { c: 3 } }', { surface: s })).toBe(
      '@media screen{p{a:1}}',
    );
  });

  it('a block born of `@import … screen` goes too when emptied', () => {
    const flat = flattenImports('./main.css', '@import "./b.css" screen;\np { a: 1 }', (spec) =>
      spec === './b.css' ? 'q { b: 2 }' : null,
    );
    const out = pruneSheet(flat, { surface: surface({ tags: ['p'] }) });
    expect(out.css).toBe('p{a:1}');
    expect(out.contributing).toEqual(['./main.css']);
  });

  it('`@layer a, b;`, `@charset`, `@namespace`, `@page` and an unknown at-rule stay', () => {
    const css = '@charset "utf-8";\n@layer a, b;\n@namespace svg url(x);\n@page { margin: 0 }\n@foo bar { baz: 1 }\np { a: 1 }';
    expect(kept(css, { surface: surface({ tags: ['p'] }) })).toBe(compactProjectCss(css));
  });

  it('a sheet with only inert statements left is empty', () => {
    expect(kept('@charset "utf-8";\n@layer a, b;\nq { a: 1 }')).toBe('');
  });

  it('a `@media` nested in a rule stays with its parent, and holds its declarations', () => {
    const s = surface({ tags: ['p'] });
    expect(kept('p { a: 1; @media screen { b: 2 } }', { surface: s })).toBe('p{a:1;@media screen{b:2}}');
    expect(kept('q { a: 1; @media screen { b: 2 } }', { surface: s })).toBe('');
  });

  it('an `@import` left in a document sheet stays; in an adopted sheet it goes', () => {
    expect(kept('@import url(https://x/y.css);\np { a: 1 }')).toBe('@import url(https://x/y.css);');
    expect(kept('@import "./b.css";\n:host { a: 1 }', { scope: 'shadow' })).toBe(':host{a:1}');
  });
});

describe('nesting (criterion 20)', () => {
  it('a nested rule goes with its parent, and is pruned alone when its parent stays', () => {
    const s = surface({ tags: ['p'], classes: ['on'] });
    expect(kept('q { a: 1; &.on { b: 2 } }', { surface: s })).toBe('');
    expect(kept('p { a: 1; &.on { b: 2 } &.off { c: 3 } }', { surface: s })).toBe('p{a:1;&.on{b:2}}');
  });

  it('a parent with only nested rules lives while one of them does', () => {
    const s = surface({ tags: ['p'], classes: ['on'] });
    expect(kept('p { &.on { b: 2 } }', { surface: s })).toBe('p{&.on{b:2}}');
    expect(kept('p { &.off { b: 2 } }', { surface: s })).toBe('');
  });
});

describe('the case of §1.4 (criterion 21)', () => {
  const files: Record<string, string> = {
    './inputs.css': 'input { border: 1px solid }\ninput::placeholder { color: gray }',
  };
  const flat = flattenImports('./main.css', '@import "./inputs.css";\nbody { margin: 0 }', (s) => files[s] ?? null);

  it('in the document `inputs.css` leaves no rule, and does not contribute', () => {
    const out = pruneSheet(flat, { surface: surface({ tags: ['x-input'] }) });
    expect(out.css).toBe('body{margin:0}');
    expect(out.contributing).toEqual(['./main.css']);
  });

  it('adopted by the component whose template holds the inputs, it keeps its rules', () => {
    const out = pruneSheet(plainSheet('./inputs.css', files['./inputs.css']!), {
      scope: 'shadow',
      surface: surface({ tags: ['input'] }),
    });
    expect(out.css).toBe('input{border:1px solid}input::placeholder{color:gray}');
    expect(out.contributing).toEqual(['./inputs.css']);
  });
});

describe('tokens (criteria 22–26)', () => {
  const p = surface({ tags: ['p'] });

  it('22 — only the used tokens stay, and `:root` goes when none does', () => {
    const root = ':root { --a: 1; --b: 2; --c: 3 }\n';
    expect(kept(`${root}p { color: var(--a) }`, { surface: p })).toBe(':root{--a:1;}p{color:var(--a)}');
    expect(kept(`${root}q { color: var(--a) }`, { surface: p })).toBe('');
  });

  it('a dead token that is the last declaration, without its `;`', () => {
    expect(kept(':root { --a: 1; --b: 2 }\np { color: var(--a) }', { surface: p })).toBe(
      ':root{--a:1;}p{color:var(--a)}',
    );
  });

  it('23 — a chain of tokens lives or dies whole', () => {
    const css = ':root { --btn: var(--blue); --blue: #00f }\n';
    expect(kept(`${css}p { color: var(--btn) }`, { surface: p })).toBe(
      ':root{--btn:var(--blue);--blue:#00f}p{color:var(--btn)}',
    );
    expect(kept(`${css}p { color: red }`, { surface: p })).toBe('p{color:red}');
  });

  it('24 — a token only a component’s `<style>` of the page reads stays', () => {
    const css = ':root { --x: 1; --y: 2 }';
    expect(kept(css, { consumers: ['.c { gap: var(--x) }'] })).toBe(':root{--x:1;}');
    expect(kept(css)).toBe('');
  });

  it('25 — a `style=` of the markup, and `style()` in a kept `@container`', () => {
    expect(kept(':root { --x: 1 }', { consumers: ['color: var(--x)'] })).toBe(':root{--x:1}');
    const css = ':root { --x: 1; --y: 2 }\n@container style(--x: 1) { p { a: 1 } }';
    expect(kept(css, { surface: p })).toBe(':root{--x:1;}@container style(--x:1){p{a:1}}');
  });

  it('26 — the variants of a token go or stay together; names are case-sensitive', () => {
    const css =
      ':root { --x: 1; --X: 9 }\n@media (prefers-color-scheme: dark) { :root { --x: 2; --X: 8 } }\np { a: var(--x) }';
    expect(kept(css, { surface: p })).toBe(
      ':root{--x:1;}@media (prefers-color-scheme:dark){:root{--x:2;}}p{a:var(--x)}',
    );
  });

  it('a token named twice is one use', () => {
    expect(kept(':root { --x: 1 }', { consumers: ['a: var(--x) var(--x)'] })).toBe(':root{--x:1}');
  });

  it('a token in a comment is not a use', () => {
    expect(kept(':root { --x: 1 }', { consumers: ['/* var(--x) */'] })).toBe('');
  });

  it('a token of one sheet lives by the kept text of another sheet of the page', () => {
    const out = prunePage(
      [
        { key: 'tokens', sheet: plainSheet('./t.css', ':root { --x: 1 }'), scope: 'document', surface: p },
        { key: 'host', sheet: plainSheet('./h.css', ':host { color: var(--x) }'), scope: 'shadow', surface: p },
      ],
      [],
    ).value;
    expect(out.map((s) => s.css)).toEqual([':root{--x:1}', ':host{color:var(--x)}']);
  });
});

describe('@keyframes, @font-face, @property (criterion 27)', () => {
  const p = surface({ tags: ['p'] });

  it('a `@keyframes` named by live text stays, else it goes', () => {
    const css = '@keyframes fade { to { opacity: 0 } }\n@keyframes "spin" { to { rotate: 1turn } }\n';
    expect(kept(`${css}p { animation: fade 1s }`, { surface: p })).toBe(
      '@keyframes fade{to{opacity:0}}p{animation:fade 1s}',
    );
    expect(kept(`${css}p { animation: spin 1s }`, { surface: p })).toBe(
      '@keyframes "spin"{to{rotate:1turn}}p{animation:spin 1s}',
    );
    expect(kept(`${css}p { animation: fader 1s }`, { surface: p })).toBe('p{animation:fader 1s}');
  });

  it('two `@keyframes` of one name live together', () => {
    const css = '@keyframes f { to { a: 1 } }\n@-webkit-keyframes f { to { a: 1 } }\np { animation: f }';
    expect(kept(css, { surface: p })).toBe(compactProjectCss(css));
  });

  it('a `@keyframes` lives through a live token', () => {
    const css = ':root { --anim: fade }\n@keyframes fade { to { a: 0 } }\np { animation: var(--anim) }';
    expect(kept(css, { surface: p })).toBe(compactProjectCss(css));
  });

  it('a `@keyframes` lives by the text of another sheet of the page', () => {
    const out = prunePage(
      [
        { key: 'a', sheet: plainSheet('./a.css', '@keyframes fade { to { a: 0 } }'), scope: 'document', surface: p },
        { key: 'b', sheet: plainSheet('./b.css', 'p { animation: fade }'), scope: 'document', surface: p },
      ],
      [],
    ).value;
    expect(out[0]!.css).toBe('@keyframes fade{to{a:0}}');
  });

  it('a `@font-face` by its family, quoted or not, case-insensitive; without one it stays', () => {
    const faces =
      '@font-face { font-family: "Inter"; src: url(./i.woff2) }\n' +
      '@font-face { font-family: Mono; src: url(./m.woff2) }\n' +
      '@font-face { font-family: Mono; src: url(./mb.woff2); font-weight: 700 }\n' +
      '@font-face { src: url(./x.woff2) }\n';
    expect(kept(`${faces}p { font-family: inter, sans-serif }`, { surface: p })).toBe(
      '@font-face{font-family:"Inter";src:url(./i.woff2)}@font-face{src:url(./x.woff2)}p{font-family:inter, sans-serif}',
    );
    expect(kept(`${faces}p { font: 1rem "Mono" }`, { surface: p })).toBe(
      '@font-face{font-family:Mono;src:url(./m.woff2)}@font-face{font-family:Mono;src:url(./mb.woff2);font-weight:700}' +
        '@font-face{src:url(./x.woff2)}p{font:1rem "Mono"}',
    );
  });

  it('`@property --x` follows its token', () => {
    const css = '@property --x { syntax: "<length>"; inherits: false }\n';
    expect(kept(`${css}p { width: var(--x) }`, { surface: p })).toBe(
      '@property --x{syntax:"<length>";inherits:false}p{width:var(--x)}',
    );
    expect(kept(`${css}p { width: 1px }`, { surface: p })).toBe('p{width:1px}');
  });

  it('what a kept `@page` or unknown at-rule says is live', () => {
    expect(kept(':root { --m: 1cm }\n@page { margin: var(--m) }')).toBe(':root{--m:1cm}@page{margin:var(--m)}');
  });
});

describe('an unreadable sheet (criterion 28)', () => {
  it('arrives whole, contributes every file, and its `var()` count', () => {
    const out = prunePage(
      [
        { key: 'bad', sheet: plainSheet('./bad.css', 'p { color: var(--x)'), scope: 'document', surface: surface() },
        { key: 'tok', sheet: plainSheet('./t.css', ':root { --x: 1; --y: 2 }'), scope: 'document', surface: surface() },
      ],
      [],
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.value).toEqual([
      { key: 'bad', css: compactProjectCss('p { color: var(--x)'), contributing: ['./bad.css'] },
      { key: 'tok', css: ':root{--x:1;}', contributing: ['./t.css'] },
    ]);
  });
});

describe('a surface and a use that hold everything (criterion 29)', () => {
  it('is `compactProjectCss` of the input, byte for byte', () => {
    const css =
      '/* guide */\n:root { --a: 1 }\n.btn, #x, [data-k="v"] { color: var(--a) }\n' +
      '@media (min-width: 40em) { ul > li:hover { margin: 0 } }\n@keyframes k { to { a: 1 } }\n' +
      'p { animation: k 1s; &.on { b: 2 } }';
    const all = surface({
      tags: ['ul', 'li', 'p'],
      openClasses: true,
      openIds: true,
      attributes: { 'data-k': null },
    });
    expect(kept(css, { surface: all })).toBe(compactProjectCss(css));
  });
});

describe('sheetDiagnostics', () => {
  it('a readable sheet says what the flattening found', () => {
    const flat = flattenImports('./main.css', '@import "./nope.css";\np { a: 1 }', () => null);
    expect(sheetDiagnostics(flat).map((d) => [d.file, d.diagnostic.code])).toEqual([['./main.css', 'FUD0853']]);
  });

  it('`FUD0851` over the file the unreadable spot is in', () => {
    const flat = flattenImports('./main.css', '@import "./b.css";\np { a: 1 }', (s) =>
      s === './b.css' ? 'b { a: 1' : null,
    );
    const found = sheetDiagnostics(flat).filter((d) => d.diagnostic.code === 'FUD0851');
    expect(found).toHaveLength(1);
    expect(found[0]!.file).toBe('./b.css');
    expect(found[0]!.diagnostic.span).toEqual({ start: 2, end: 3 });
  });

  it('a span that runs into another file ends where it starts', () => {
    const flat = flattenImports('./main.css', '@import "./b.css";\np { a: 1 }', (s) =>
      s === './b.css' ? 'b { content: "x }' : null,
    );
    const found = sheetDiagnostics(flat).filter((d) => d.diagnostic.code === 'FUD0851');
    expect(found).toHaveLength(1);
    expect(found[0]!.file).toBe('./b.css');
    expect(found[0]!.diagnostic.span.start).toBe(found[0]!.diagnostic.span.end);
  });
});

describe('projectSheetDiagnostics — `FUD0854`', () => {
  it('over every `@import`, at any depth', () => {
    const css =
      '@import "./a.css";\n@charset "x";\np { @import "./b.css"; }\n@media screen { @import "./c.css"; }\n@font-face { src: x }';
    const found = projectSheetDiagnostics(css);
    expect(found.map((d) => d.code)).toEqual(['FUD0854', 'FUD0854', 'FUD0854']);
    expect(found.map((d) => css.slice(d.span.start, d.span.end))).toEqual([
      '@import "./a.css";',
      '@import "./b.css";',
      '@import "./c.css";',
    ]);
  });

  it('nothing for a sheet without one', () => {
    expect(projectSheetDiagnostics(':root { --a: 1 }')).toEqual([]);
  });
});
