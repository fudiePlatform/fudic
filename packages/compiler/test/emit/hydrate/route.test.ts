// @vitest-environment happy-dom
/**
 * SDD-39 §6.4, §6.7 — the route adopts the page the layout composed.
 *
 * The same property the component harness exists for, asked of a route: the tree the SERVER
 * painted is the tree the CLIENT adopts, node for node, without building one. What makes it
 * worth running rather than reading is the layout — the route's markup is not at the root of
 * anything, it sits among nodes written by another file, and a cursor that is one step out
 * lands on the wrong element with no error anywhere.
 *
 * So: render route + layout for real, serialize, parse that HTML into a document, and drive
 * the emitted chunk over it with construction FORBIDDEN.
 */

import { describe, expect, it } from 'vitest';
import { browserDom, type DomClient } from '@fudic/dom';
import { signal, computed, live, subscribe } from '@fudic/core';
import { resolveDocument } from '../../../src/emit/resolve.js';
import {
  emitLayoutModule,
  emitPageModule,
  emitRouteModule,
  emitRouteClientModule,
} from '../../../src/emit/index.js';
import { memoryIo, ssrIo } from '../_support.js';

const LAYOUT = [
  '<!DOCTYPE html><html><head>@RenderHead()</head>',
  '<body>',
  '@RenderSection(nav)',
  '<main>@RenderBody()</main>',
  '<footer class="site"><p>pie</p></footer>',
  '</body></html>',
].join('\n');

type PageFn = (data: unknown, io: unknown) => Iterable<string>;

/** Evaluate an emitted module with its imports stripped and their bindings injected. */
function evalModule(code: string, bindings: Record<string, unknown>, returns: string): unknown {
  const body = code.replace(/^import[^\n]*\n/gmu, '').replace(/^export\s+/gmu, '') + `\nreturn ${returns};`;
  const names = Object.keys(bindings);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(...names, body)(...Object.values(bindings)) as unknown;
}

/** The chunk's default export, with the same treatment. */
type RouteFactory = (props: readonly unknown[]) => {
  h: () => void;
  u: () => void;
  r: () => void;
};

function routeFactory(code: string): RouteFactory {
  const body = code.replace(/^import[^\n]*\n/gmu, '').replace(/^export default /mu, 'return ');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function('signal', 'computed', '$sub', '$live', body)(
    signal,
    computed,
    subscribe,
    live,
  ) as RouteFactory;
}

/**
 * `browserDom` with construction forbidden WHILE ADOPTING, and allowed afterwards.
 *
 * `adoptOnly` alone cannot serve here: the `$dom` a route captures is the one it keeps for
 * life, and a construct that switches branch after hydrating is supposed to build. What has
 * to build nothing is `h`, and that is exactly the window this closes.
 */
function guardedDom(): { dom: DomClient<Node>; open: () => void } {
  let adopting = true;
  const forbid =
    (op: 'element' | 'text' | 'append') =>
    (...args: unknown[]): unknown => {
      if (adopting) throw new Error(`hydrate must not call ${op}: it adopts, it does not build`);
      return (browserDom[op] as (...a: unknown[]) => unknown)(...args);
    };
  return {
    dom: {
      ...browserDom,
      element: forbid('element') as DomClient<Node>['element'],
      text: forbid('text') as DomClient<Node>['text'],
      append: forbid('append') as DomClient<Node>['append'],
    },
    open: () => {
      adopting = false;
    },
  };
}

/**
 * Render the composed document, parse its `<body>` into the live one, and hand the route its
 * `h`. What comes back is the controller, already hooked up.
 */
function hydrate(route: string, extra: Record<string, string> = {}): ReturnType<RouteFactory> {
  const io = memoryIo({ '/r.fud': route, '/l.fud': LAYOUT, ...extra });
  const graph = resolveDocument('/r.fud', io).value;
  const layout = evalModule(emitLayoutModule(graph, graph.layouts[0]!), {}, 'layout');
  const page = evalModule(emitRouteModule(graph), { layout }, 'page') as PageFn;
  const html = [...page({}, ssrIo().io)].join('');
  const open = html.indexOf('>', html.indexOf('<body')) + 1;
  document.body.innerHTML = html.slice(open, html.lastIndexOf('</body>'));

  const guard = guardedDom();
  const controller = routeFactory(emitRouteClientModule(graph)!)([guard.dom, document.body, {}]);
  controller.h();
  guard.open();
  return controller;
}

describe('a route adopts the composed page from the `<body>` (§6.4)', () => {
  const route = [
    '<link rel="layout" href="./l.fud">',
    '@code { @client {',
    '  const count = signal(1);',
    '  function mas() { count.set(count() + 1); }',
    '} }',
    '@section nav { <button class="nav" @click=@mas>nav +1</button> }',
    '<div class="panel">',
    '  <button class="mas" @click=@mas>+1</button>',
    '  <output class="valor">@count()</output>',
    '</div>',
  ].join('\n');

  it('paints the initial value on the server and moves it on a click', () => {
    hydrate(route);
    const out = document.querySelector('output.valor')!;
    expect(out.textContent).toBe('1');
    (document.querySelector('button.mas') as HTMLElement).click();
    expect(out.textContent).toBe('2');
  });

  it('hooks up a button written inside a `@section`, on the other side of the document', () => {
    hydrate(route);
    const out = document.querySelector('output.valor')!;
    // The nav button is a child of `<body>`, the output is inside `<main>`: one handler,
    // two positions of the same walk (§4.4).
    (document.querySelector('button.nav') as HTMLElement).click();
    expect(out.textContent).toBe('2');
  });

  it('leaves the layout alone: the footer is exactly what the server wrote', () => {
    hydrate(route);
    expect(document.querySelector('footer.site')!.textContent).toContain('pie');
  });

  it('releases what it hooked up', () => {
    const controller = hydrate(route);
    const out = document.querySelector('output.valor')!;
    controller.r();
    (document.querySelector('button.mas') as HTMLElement).click();
    expect(out.textContent).toBe('1');
  });
});

describe('the constructs of a route reconcile like a component’s', () => {
  const route = [
    '<link rel="layout" href="./l.fud">',
    '@code { @client {',
    '  const count = signal(1);',
    '  const filas = computed(() => Array.from({ length: count() }, (_, i) => ({ id: i })));',
    '  function mas() { count.set(count() + 1); }',
    '} }',
    '<button class="mas" @click=@mas>+1</button>',
    '<div class="caso">',
    '  @if (count() > 1) { <p class="salida">más de uno</p> } else { <p class="salida">uno</p> }',
    '</div>',
    '<ul class="lista">@foreach (const fila of filas()) key (fila.id) { <li>fila @fila.id</li> }</ul>',
  ].join('\n');

  it('switches the `@if` branch and grows the `@foreach`', () => {
    hydrate(route);
    expect(document.querySelector('p.salida')!.textContent).toBe('uno');
    expect(document.querySelectorAll('ul.lista li')).toHaveLength(1);
    (document.querySelector('button.mas') as HTMLElement).click();
    expect(document.querySelector('p.salida')!.textContent).toBe('más de uno');
    expect(document.querySelectorAll('ul.lista li')).toHaveLength(2);
  });
});

describe('a page that owns its own shell adopts the same way', () => {
  it('walks straight off the `<body>`, with no layout to step over', () => {
    const io = memoryIo({
      '/p.fud': [
        '<!DOCTYPE html><html><head>',
        '@code { @client { const n = signal(3); function mas() { n.set(n() + 1); } } }',
        '</head><body>',
        '<button class="mas" @click=@mas>+1</button>',
        '<output>@n()</output>',
        '</body></html>',
      ].join('\n'),
    });
    const graph = resolveDocument('/p.fud', io).value;
    const page = evalModule(emitPageModule(graph), {}, 'page') as PageFn;
    const html = [...page({}, ssrIo().io)].join('');
    const open = html.indexOf('>', html.indexOf('<body')) + 1;
    document.body.innerHTML = html.slice(open, html.lastIndexOf('</body>'));

    const guard = guardedDom();
    const controller = routeFactory(emitRouteClientModule(graph)!)([guard.dom, document.body, {}]);
    controller.h();
    guard.open();
    const out = document.querySelector('output')!;
    expect(out.textContent).toBe('3');
    (document.querySelector('button.mas') as HTMLElement).click();
    expect(out.textContent).toBe('4');
  });
});
