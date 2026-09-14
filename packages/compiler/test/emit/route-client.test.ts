/**
 * SDD-39 §6.3–§6.6 — the client chunk of a route.
 *
 * The subject is the ADOPT path: a route walks the layout's markup with its own spliced in,
 * from the `<body>` down, and every anchor it publishes is its own. What the layout
 * contributes is calls to the cursor — never a byte of its source.
 */

import { describe, expect, it } from 'vitest';
import { resolveDocument } from '../../src/emit/resolve.js';
import {
  emitRouteClientModule,
  emitRouteClientModuleMapped,
  hydratableTags,
  isReactiveRoute,
  routeHydration,
} from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

/** The layout of `examples/basic`: a loose `@RenderSection(nav)` and a `<main>` body. */
const LAYOUT = [
  '<!DOCTYPE html><html><head>@RenderHead()</head>',
  '<body>',
  '@RenderSection(nav)',
  '<main>@RenderBody()</main>',
  '<footer class="site"><p>pie</p></footer>',
  '</body></html>',
].join('\n');

const NAV = [
  '<site-nav><template shadowrootmode="open"><slot></slot></template></site-nav>',
].join('\n');

function chunkOf(route: string, extra: Record<string, string> = {}): string | null {
  const io = memoryIo({ '/r.fud': route, '/l.fud': LAYOUT, ...extra });
  return emitRouteClientModule(resolveDocument('/r.fud', io).value);
}

function graphOf(route: string, extra: Record<string, string> = {}): ReturnType<typeof resolveDocument>['value'] {
  const io = memoryIo({ '/r.fud': route, '/l.fud': LAYOUT, ...extra });
  return resolveDocument('/r.fud', io).value;
}

describe('who gets a chunk (§6.3, §4.5)', () => {
  it('a route with no client half at all emits none — not even a mapped one', () => {
    const route = '<link rel="layout" href="./l.fud">\n<p>estático</p>';
    const graph = graphOf(route);
    expect(isReactiveRoute(graph)).toBe(false);
    expect(chunkOf(route)).toBeNull();
    expect(emitRouteClientModuleMapped(graph)).toBeNull();
  });

  it('a route whose markup holds no element declares no node variable', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '@code { @client { const n = signal(1); function nada() {} } }',
      'texto suelto',
    ].join('\n');
    const code = chunkOf(route)!;
    expect(code).not.toContain('let $n0');
    expect(code).toContain('const $s = () => {};');
  });

  it('a route that only composes reactive components stays at zero JavaScript of its own', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '<link rel="component" href="./c.fud">',
      '<app-c></app-c>',
    ].join('\n');
    const c = [
      '<app-c><template shadowrootmode="open">',
      '@code { @client { const n = signal(0); } }',
      '<button @click=@nada>@n()</button>',
      '</template></app-c>',
    ].join('\n');
    expect(isReactiveRoute(graphOf(route, { '/c.fud': c }))).toBe(false);
  });

  it('an `@evento` alone is enough, with no signal anywhere', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '@code { @client { function sube() {} } }',
      '<button @click=@sube>+</button>',
    ].join('\n');
    expect(isReactiveRoute(graphOf(route))).toBe(true);
    expect(chunkOf(route)).toContain('export default ($props) =>');
  });

  it('a reactive declared in `@code` is enough on its own', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '@code { @client { const n = signal(1); } }',
      '<output>@n()</output>',
    ].join('\n');
    expect(isReactiveRoute(graphOf(route))).toBe(true);
  });
});

describe('the shape of the module (§3.4)', () => {
  const route = [
    '<link rel="layout" href="./l.fud">',
    '@code { @client {',
    '  import { signal } from "@fudic/core";',
    '  const count = signal(1);',
    '  function mas() { count.set(count() + 1); }',
    '} }',
    '<button @click=@mas>+1</button>',
    '<output>@count()</output>',
  ].join('\n');

  it('is a default export that takes `[$dom, $root, $data, …]` and returns `h`, `u`, `r`', () => {
    const code = chunkOf(route)!;
    expect(code).toContain('export default ($props) => {');
    expect(code).toContain('let [$dom, $root, $data] = $props;');
    expect(code).toContain('h: () => {');
    expect(code).toMatch(/\bu: \(\) => \{/u);
    expect(code).toMatch(/\br: \(\) => \{/u);
  });

  it('has no `c`: a route is never fabricated hot, so there is no create path', () => {
    const code = chunkOf(route)!;
    expect(code).not.toContain('c: () =>');
    expect(code).not.toContain('customElements.define');
    expect(code).not.toContain('const $m =');
  });

  it('carries the `@client` body verbatim and binds `data`', () => {
    const code = chunkOf(route)!;
    expect(code).toContain('const count = signal(1);');
    expect(code).toContain('function mas() { count.set(count() + 1); }');
    expect(code).toContain('const data = $data;');
  });
});

describe('the walk crosses the layout by cursor (§6.4)', () => {
  const route = [
    '<link rel="layout" href="./l.fud">',
    '<link rel="component" href="./nav.fud">',
    '@code { @client { const n = signal(1); function mas() { n.set(n() + 1); } } }',
    '@section nav { <button class="sube" @click=@mas>nav</button> }',
    '<output>@n()</output>',
  ].join('\n');

  it('adopts the section at the body level and the body inside `<main>`', () => {
    const code = chunkOf(route, { '/nav.fud': NAV })!;
    // The body level: its cursor opens on the `<body>`, and the section's button comes first.
    expect(code).toContain('let $lc0 = $dom.firstElementChild($root);');
    // `<main>` is entered — the route's own markup is inside it.
    expect(code).toContain('const $lp0 = $lc0;');
    expect(code).toContain('let $lc1 = $dom.firstElementChild($lp0);');
  });

  it('never touches the `<footer>` the layout wrote after the body', () => {
    const code = chunkOf(route, { '/nav.fud': NAV })!;
    expect(code).not.toContain('footer');
    expect(code).not.toContain('pie');
    // And the walk stops at `<main>`: one element is ever entered, and nothing follows it.
    expect(code).toContain('const $lp0 =');
    expect(code).not.toContain('$lp1');
  });

  it('hooks up a listener written inside a `@section` exactly like one of the body', () => {
    const code = chunkOf(route, { '/nav.fud': NAV })!;
    expect(code).toContain('$dom.event(');
  });
});

describe('nested layouts change the depth of the walk and nothing else (§6.5)', () => {
  const OUTER = [
    '<!DOCTYPE html><html><head>@RenderHead()</head>',
    '<body><div class="shell">@RenderBody()</div></body></html>',
  ].join('\n');
  const INNER = [
    '<!DOCTYPE html><html><head><link rel="layout" href="./outer.fud">@RenderHead()</head>',
    '<body><main>@RenderBody()</main></body></html>',
  ].join('\n');

  it('walks one more level and hooks up the same thing', () => {
    const route = [
      '<link rel="layout" href="./inner.fud">',
      '@code { @client { const n = signal(1); } }',
      '<output>@n()</output>',
    ].join('\n');
    const io = memoryIo({ '/r.fud': route, '/inner.fud': INNER, '/outer.fud': OUTER });
    const code = emitRouteClientModule(resolveDocument('/r.fud', io).value)!;
    expect(code).toContain('let $lc0 = $dom.firstElementChild($root);');
    expect(code).toContain('let $lc1 = $dom.firstElementChild($lp0);');
    expect(code).toContain('let $lc2 = $dom.firstElementChild($lp1);');
  });
});

describe('the layout can put anything in front of the hole', () => {
  it('steps over an element that holds nothing of the route', () => {
    const layout = [
      '<!DOCTYPE html><html><head>@RenderHead()</head>',
      '<body><header><h1>título</h1></header><main>@RenderBody()</main></body></html>',
    ].join('\n');
    const io = memoryIo({
      '/r.fud': [
        '<link rel="layout" href="./x.fud">',
        '@code { @client { const n = signal(1); } }',
        '<output>@n()</output>',
      ].join('\n'),
      '/x.fud': layout,
    });
    const code = emitRouteClientModule(resolveDocument('/r.fud', io).value)!;
    // `<header>` is one step of the cursor and nothing else — no variable, no descent.
    expect(code).toContain('$lc0 = $dom.nextElementSibling($lc0);');
    expect(code).not.toContain('título');
  });

  it('finds a `@RenderBody()` written inside a construct of the layout', () => {
    const layout = [
      '<!DOCTYPE html><html><head>@RenderHead()</head>',
      '<body>@if (true) { <main>@RenderBody()</main> }</body></html>',
    ].join('\n');
    const io = memoryIo({
      '/r.fud': [
        '<link rel="layout" href="./x.fud">',
        '@code { @client { const n = signal(1); } }',
        '<output>@n()</output>',
      ].join('\n'),
      '/x.fud': layout,
    });
    const code = emitRouteClientModule(resolveDocument('/r.fud', io).value)!;
    expect(code).toContain('let $lc1 = $dom.firstElementChild($lp0);');
  });
});

describe('the neutral zone reaches the chunk too', () => {
  it('hoists its imports and runs its body before `@client`', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '@code {',
      '  import { saluda } from "./util.js";',
      '  const prefijo = "hola";',
      '  @client { const n = signal(1); }',
      '}',
      '<output>@n()</output>',
    ].join('\n');
    const code = chunkOf(route)!;
    expect(code).toContain('import { saluda } from "./util.js";');
    expect(code).toContain('const prefijo = "hola";');
    expect(code.indexOf('const prefijo')).toBeLessThan(code.indexOf('const n = signal(1);'));
  });
});

describe('a `control` written straight in the route (§1.3)', () => {
  const route = [
    '<link rel="layout" href="./l.fud">',
    '@code { import { userForm } from "./user.form.js"; }',
    '<form control>',
    '  <input control="@userForm.nombre">',
    '</form>',
  ].join('\n');

  it('gets a chunk, its bindings and its place in the eager list', () => {
    const code = chunkOf(route)!;
    expect(code).toContain("from '@fudic/forms/dom'");
    expect(code).toContain('import { userForm } from "./user.form.js";');
    expect(routeHydration(graphOf(route))).toBe('eager');
  });
});

describe('a signal of the route crossing to a component', () => {
  const CHILD = [
    '@code { const { count } = props<{ count: Signal<number> }>(); }',
    '<signal-display><template shadowrootmode="open">',
    '<output>@count()</output>',
    '</template></signal-display>',
  ].join('\n');
  const CB = [
    '@code { const { onSave } = props<{ onSave: () => void }>(); }',
    '<app-btn><template shadowrootmode="open">',
    '<button @click=@onSave()>ok</button>',
    '</template></app-btn>',
  ].join('\n');

  it('gives the signal a cell slot behind `$data`', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '<link rel="component" href="./d.fud">',
      '@code { @client { const count = signal(1); } }',
      '<signal-display .count=@count></signal-display>',
    ].join('\n');
    const code = chunkOf(route, { '/d.fud': CHILD })!;
    // Three leading slots — `$dom`, `$root`, `$data` — so the first cell is `$p3`.
    expect(code).toContain('let [$dom, $root, $data, $p3] = $props;');
    expect(code).toContain('const count = $p3 ?? signal(1);');
  });

  it('fills a callback cell on hookup, the way a component does', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '<link rel="component" href="./b.fud">',
      '@code { @client { function guarda() {} } }',
      '<app-btn .onSave=@guarda></app-btn>',
    ].join('\n');
    const code = chunkOf(route, { '/b.fud': CB })!;
    expect(code).toContain('$p3?.set(guarda);');
  });

  it('crosses a callback declared in the NEUTRAL zone with no cell at all', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '<link rel="component" href="./b.fud">',
      '@code {',
      '  function guarda() {}',
      '  @client { const n = signal(1); }',
      '}',
      '<app-btn .onSave=@guarda></app-btn>',
    ].join('\n');
    const code = chunkOf(route, { '/b.fud': CB })!;
    // No slot is minted for it: a neutral name is not a `@client` binding, so what crosses is
    // the reader over the closure and nothing else.
    expect(code).toContain('(() => guarda)');
    expect(code).not.toContain('?.set(guarda)');
  });

  it('makes the child hydratable: a route that hands a signal seeds the induced rule', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '<link rel="component" href="./d.fud">',
      '@code { @client { const count = signal(1); } }',
      '<signal-display .count=@count></signal-display>',
    ].join('\n');
    expect([...hydratableTags(graphOf(route, { '/d.fud': CHILD }))]).toContain('signal-display');
  });

  it('and a static route seeds nothing: composing islands is not being one', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '<link rel="component" href="./d.fud">',
      '<signal-display .count="1"></signal-display>',
    ].join('\n');
    expect([...hydratableTags(graphOf(route, { '/d.fud': CHILD }))]).not.toContain('signal-display');
  });
});

describe('a `@RenderSection` with no name renders nothing and is walked as nothing', () => {
  it('leaves the level untouched', () => {
    const layout = [
      '<!DOCTYPE html><html><head>@RenderHead()</head>',
      '<body>@RenderSection()<main>@RenderBody()</main></body></html>',
    ].join('\n');
    const io = memoryIo({
      '/r.fud': [
        '<link rel="layout" href="./x.fud">',
        '@code { @client { const n = signal(1); } }',
        '<output>@n()</output>',
      ].join('\n'),
      '/x.fud': layout,
    });
    const code = emitRouteClientModule(resolveDocument('/r.fud', io).value)!;
    expect(code).toContain('let $lc1 = $dom.firstElementChild($lp0);');
  });
});

describe('what a route shares with a component, asked of a route', () => {
  it('delegates a loop with ONE table and one listener (SDD-37)', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '@code { @client {',
      '  const dias = signal([{ id: 1, n: "L" }]);',
      '  function pick(ev, dia) { void ev; void dia; }',
      '} }',
      '<div class="grid" @click=@pick($event, $dia)>',
      '  @foreach (const dia of dias()) key (dia.id) {',
      '    <div class="cell" delegate:dia><span>@dia.n</span></div>',
      '  }',
      '</div>',
    ].join('\n');
    const code = chunkOf(route)!;
    expect(code.split('new WeakMap()')).toHaveLength(2);
    expect(code.split('$dom.event(')).toHaveLength(2);
  });

  it('links a relative asset into an import, exactly as a component does (SDD-19 §4.5)', () => {
    const io = memoryIo({
      '/r.fud': [
        '<link rel="layout" href="./l.fud">',
        '@code { @client { const n = signal(1); } }',
        '<img src="./foto.png" alt="x">',
        '<output>@n()</output>',
      ].join('\n'),
      '/l.fud': LAYOUT,
    });
    const code = emitRouteClientModule(resolveDocument('/r.fud', io).value, {
      linkAssets: true,
      assetExists: () => true,
    })!;
    expect(code).toContain('from "./foto.png"');
  });
});

describe('source maps: one source, and it is the route (§6.6)', () => {
  it('anchors nothing to the layout', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '@code { @client { const n = signal(1); } }',
      '<output>@n()</output>',
    ].join('\n');
    const io = memoryIo({ '/r.fud': route, '/l.fud': LAYOUT });
    const out = emitRouteClientModuleMapped(resolveDocument('/r.fud', io).value)!;
    expect(out.mappings.length).toBeGreaterThan(0);
    // Every anchor lands inside the route's own file, which is the only source there is.
    for (const m of out.mappings) {
      expect(m.sourceOffset).toBeGreaterThanOrEqual(0);
      expect(m.sourceOffset).toBeLessThanOrEqual(route.length);
    }
    // And the layout's own text is nowhere in the chunk.
    expect(out.code).not.toContain('site');
    expect(out.code).not.toContain('RenderBody');
  });
});

describe('how a route comes up (§4.6)', () => {
  const gesture = [
    '<link rel="layout" href="./l.fud">',
    '@code { @client { const n = signal(1); } }',
    '<output>@n()</output>',
  ].join('\n');

  it('on a gesture, which is the general case', () => {
    expect(routeHydration(graphOf(gesture))).toBe('gesture');
  });

  it('at install when `@client` calls `effect(...)`', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '@code { @client {',
      '  const ahora = signal(0);',
      '  effect(() => { const id = setInterval(() => ahora.set(1), 1000); return () => clearInterval(id); });',
      '} }',
      '<time>@ahora()</time>',
    ].join('\n');
    expect(routeHydration(graphOf(route))).toBe('eager');
  });

  it('at install when the route writes a `control`', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '@code { import { f } from "./f.js"; }',
      '<input control="@f.nombre">',
    ].join('\n');
    expect(routeHydration(graphOf(route))).toBe('eager');
  });

  it('says `gesture` for a file that is not a route at all', () => {
    const io = memoryIo({
      '/c.fud': '<app-c><template shadowrootmode="open"><p>c</p></template></app-c>',
    });
    const graph = resolveDocument('/c.fud', io).value;
    expect(routeHydration(graph)).toBe('gesture');
    expect(isReactiveRoute(graph)).toBe(false);
  });
});
