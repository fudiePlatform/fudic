// @vitest-environment happy-dom
/**
 * SDD-70 §4.4 — the construct in the client: `@await` adopts what the server painted.
 *
 * The page goes out in parts and the browser reads them: every block `data-fud-part` and every
 * `<!--fud-end-->` is gone by the time the route comes up, and what each part awaited is in the
 * `fields` the runtime hands the route. So: render route + layout for real, in parts, parse the
 * HTML into the live `<body>`, take the blocks out as the reader does, and drive the emitted
 * chunk over what is left with construction FORBIDDEN while it adopts.
 *
 * What proves the cursor is in step is what comes AFTER the `@await`: a binding there that
 * moves on a click is a node the walk found by counting past everything the block adopted.
 */

import { describe, expect, it } from 'vitest';
import { browserDom, emit, type DomClient } from '@fudic/dom';
import { signal, computed, effect, live, owned, subscribe, written } from '@fudic/core';
import { PageParts } from '@fudic/ssr';
import { resolveDocument } from '../../../src/emit/resolve.js';
import { emitLayoutModule, emitRouteModule, emitRouteClientModule } from '../../../src/emit/index.js';
import type { LinkedApi, ResolveIo } from '../../../src/types/io.js';
import { drain, memoryIo, ssrIo, type PageFn } from '../_support.js';

const LAYOUT = [
  '<!DOCTYPE html><html><head>@RenderHead()</head>',
  '<body>',
  '<main>@RenderBody()</main>',
  '<footer class="site"><p>pie</p></footer>',
  '</body></html>',
].join('\n');

/** The facts of `r.fudapi`: a `load` with `users` marked `later`, so `data` can come again. */
const API: LinkedApi = {
  id: 'routes/r',
  load: true,
  route: '/r.fud',
  paths: false,
  layout: false,
  functions: [],
  forms: [],
  later: ['users'],
};

/** Evaluate an emitted module with its imports stripped and their bindings injected. */
function evalModule(code: string, bindings: Record<string, unknown>, returns: string): unknown {
  const body = code.replace(/^import[^\n]*\n/gmu, '').replace(/^export\s+/gmu, '') + `\nreturn ${returns};`;
  const names = Object.keys(bindings);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(...names, body)(...Object.values(bindings)) as unknown;
}

interface Controller {
  h: () => void;
  u: () => void;
  r: () => void;
}

/** The chunk's default export: the props, and the `later` fields the parts carried. */
type RouteFactory = (props: readonly unknown[], fields?: Readonly<Record<string, unknown>>) => Controller;

/** Where the chunk's `$stale` leaves the callback a new `data` arrives through. */
interface Refresh {
  next?: (data: unknown) => void;
}

function routeFactory(code: string, refresh: Refresh): RouteFactory {
  const stale = (_load: unknown, next: (data: unknown) => void): (() => void) => {
    refresh.next = next;
    return () => {};
  };
  return evalModule(
    code.replace(/^export default /mu, 'const $route = '),
    { signal, computed, effect, $sub: subscribe, $written: written, $live: live, $owned: owned, emit, $stale: stale, $load: null },
    '$route',
  ) as RouteFactory;
}

/** `browserDom` with construction forbidden while adopting, and allowed afterwards. */
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
 * What the reader of parts leaves behind (SDD-70 §4.4): the blocks read into memory and taken
 * out, and the markers too. What comes back is the `fields` every part carried.
 */
function readParts(root: HTMLElement): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const block of [...root.querySelectorAll('script[data-fud-part]')]) {
    Object.assign(fields, (JSON.parse(block.textContent!) as { fields?: object }).fields);
    block.remove();
  }
  const ends: Node[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) if ((n as Comment).data === 'fud-end') ends.push(n);
  for (const end of ends) end.parentNode!.removeChild(end);
  return fields;
}

/** Settled the way `runLoad` settles a `later` field. */
const ok = (value: unknown): Promise<unknown> => Promise.resolve({ ok: value });
const failed = (status: number, title: string): Promise<unknown> =>
  Promise.resolve({ error: { status, title }, cause: new Error(title) });

interface Hydrated {
  readonly controller: Controller;
  readonly refresh: Refresh;
  readonly fields: Record<string, unknown>;
}

/** Render the composed page in parts, read its blocks out, and hand the route its `h`. */
/** The route with its layout and its `.fudapi`. */
function routeGraph(route: string): ReturnType<typeof resolveDocument>['value'] {
  const io: ResolveIo = {
    ...memoryIo({ '/r.fud': `<link rel="layout" href="./l.fud">\n<link rel="server" href="./r.fudapi">\n${route}`, '/l.fud': LAYOUT }),
    api: (path) => (path === '/r.fudapi' ? API : undefined),
  };
  return resolveDocument('/r.fud', io).value;
}

async function hydrate(route: string, data: Record<string, unknown>): Promise<Hydrated> {
  const graph = routeGraph(route);
  const layout = evalModule(emitLayoutModule(graph, graph.layouts[0]!), {}, 'layout');
  const page = evalModule(emitRouteModule(graph, { routeName: 'r' }), { layout }, 'page') as PageFn;
  const errors: unknown[] = [];
  const parts = {
    ...(ssrIo().io as Record<string, unknown>),
    parts: (dom: never, body: never, options: never) => new PageParts(dom, body, options),
    onError: (error: unknown) => errors.push(error),
    runtime: { boot: '', main: '/main.js', pieces: [], inline: '' },
  };
  const html = await drain(page(data, parts));
  const open = html.indexOf('>', html.indexOf('<body')) + 1;
  document.body.innerHTML = html.slice(open, html.lastIndexOf('</body>'));
  const fields = readParts(document.body);

  const refresh: Refresh = {};
  const guard = guardedDom();
  const controller = routeFactory(emitRouteClientModule(graph)!, refresh)([guard.dom, document.body, {}], fields);
  controller.h();
  guard.open();
  return { controller, refresh, fields };
}

const click = (selector: string): void => (document.querySelector(selector) as HTMLElement).click();
const text = (selector: string): string | null => document.querySelector(selector)!.textContent;

const ROUTE = [
  '@code {',
  '  const n = signal(1);',
  '  function mas() { n.set(n() + 1); }',
  '}',
  '<h1 class="top">@n()</h1>',
  '@await data.users {',
  '  <ul class="users">@foreach (const u of data.users) key (u) { <li>@u</li> }</ul>',
  '  <button class="mas" @click=@mas>+1</button>',
  '  <output class="valor">@n() de @data.users.length</output>',
  '} @catch (e) {',
  '  <p class="error">@e.status @e.title</p>',
  '  <button class="otra" @click=@mas>+1</button>',
  '}',
  '<p class="after">@n()</p>',
].join('\n');

describe('`@await` adopts its body with the field that came with the HTML (§4.4)', () => {
  it('the field travels in the `fields` of its part, and the body is what the server painted', async () => {
    const { fields } = await hydrate(ROUTE, { users: ok(['ana', 'bea']) });
    expect(fields).toEqual({ users: { ok: ['ana', 'bea'] } });
    expect([...document.querySelectorAll('ul.users li')].map((li) => li.textContent)).toEqual(['ana', 'bea']);
    expect(document.querySelector('script[data-fud-part]')).toBeNull();
  });

  it('an event inside the body works, and the bindings inside and after it move', async () => {
    await hydrate(ROUTE, { users: ok(['ana', 'bea']) });
    expect(text('output.valor')).toBe('1 de 2');
    click('button.mas');
    expect(text('output.valor')).toBe('2 de 2');
    expect(text('h1.top')).toBe('2');
    expect(text('p.after')).toBe('2');
    expect(document.querySelectorAll('ul.users li')).toHaveLength(2);
    expect(document.querySelector('p.error')).toBeNull();
  });

  it('releases what it hooked up: the body retires its nodes, what is outside stops moving', async () => {
    const { controller } = await hydrate(ROUTE, { users: ok(['ana']) });
    const button = document.querySelector('button.mas') as HTMLElement;
    controller.r();
    // A block retires its own nodes on release, like any `@if` (SDD-30).
    expect(document.querySelector('ul.users')).toBeNull();
    button.click();
    expect(text('h1.top')).toBe('1');
    expect(text('p.after')).toBe('1');
  });
});

describe('`@catch` adopts with the `Problem` the part carried', () => {
  it('paints the error, and an event inside the `@catch` works', async () => {
    const { fields } = await hydrate(ROUTE, { users: failed(503, 'Caído') });
    expect(fields).toEqual({ users: { error: { status: 503, title: 'Caído' } } });
    expect(text('p.error')).toBe('503 Caído');
    expect(document.querySelector('ul.users')).toBeNull();
    click('button.otra');
    expect(text('p.after')).toBe('2');
    expect(text('p.error')).toBe('503 Caído');
  });

  it('a failure with no `@catch` paints nothing on either side, and what follows is adopted', async () => {
    const route = [
      '@code { const n = signal(1); function mas() { n.set(n() + 1); } }',
      '<button class="mas" @click=@mas>+1</button>',
      '@await data.users { <p class="body">@data.users</p> }',
      '<p class="after">@n()</p>',
    ].join('\n');
    await hydrate(route, { users: failed(500, 'Error') });
    expect(document.querySelector('p.body')).toBeNull();
    click('button.mas');
    expect(text('p.after')).toBe('2');
  });
});

describe('a new `data` whose field is a promise (§4.4, last bullet)', () => {
  it('keeps what is painted while it waits, and repaints when it settles', async () => {
    const { refresh } = await hydrate(ROUTE, { users: ok(['ana', 'bea']) });
    let settle!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      settle = resolve;
    });
    refresh.next!({ users: pending });
    click('button.mas');
    // Waiting: the body stays, with the value it had, and still moves with the rest.
    expect(text('output.valor')).toBe('2 de 2');
    expect(document.querySelectorAll('ul.users li')).toHaveLength(2);

    settle({ ok: ['carla'] });
    await pending;
    await Promise.resolve();
    expect([...document.querySelectorAll('ul.users li')].map((li) => li.textContent)).toEqual(['carla']);
    expect(text('output.valor')).toBe('2 de 1');

    // A second pass over the same promise neither waits again nor repaints anything new.
    click('button.mas');
    expect(text('output.valor')).toBe('3 de 1');

    // And a promise that fails switches to the `@catch`, in place.
    const broken = failed(500, 'Roto');
    refresh.next!({ users: broken });
    await broken;
    await Promise.resolve();
    expect(text('p.error')).toBe('500 Roto');
    expect(document.querySelector('ul.users')).toBeNull();
    expect(document.querySelectorAll('main > p.after')).toHaveLength(1);
  });

  it('a `data` with no value for the field paints nothing', async () => {
    const { refresh } = await hydrate(ROUTE, { users: ok(['ana']) });
    refresh.next!({});
    expect(document.querySelector('ul.users')).toBeNull();
    expect(document.querySelector('p.error')).toBeNull();
    expect(text('p.after')).toBe('1');
  });
});

describe('SDD-85 criterion 12 — an `@await` the browser creates goes through its blocks as one painted', () => {
  const NESTED = [
    '@code { const on = signal(false); function abrir() { on.set(!on()); } }',
    '<button class="abrir" @click=@abrir>abrir</button>',
    '@if (on()) {',
    '  @await data.users { <ul class="users">@foreach (const u of data.users) key (u) {<li>@u</li>}</ul> }',
    '  @catch (e) { <p class="error">@e.title</p> }',
    '}',
    '<p class="after">fin</p>',
  ].join('\n');
  /** The names of what lies between the button and the paragraph after, in order. */
  const between = (): string[] =>
    [...document.querySelector('main')!.children].map((el) => el.className).filter((c) => c !== 'abrir' && c !== 'after');

  it('created with its field settled, then failed, then settled again, always in its place', async () => {
    const { refresh } = await hydrate(NESTED, { users: ok(['ana']) });
    expect(between()).toEqual([]);
    // The `@if` opens: its body and the `@await` in it are created from their templates. The field
    // never travelled — the server did not paint the `@await` — so it waits for a `data`.
    click('button.abrir');
    expect(between()).toEqual([]);
    const first = ok(['ana']);
    refresh.next!({ users: first });
    await first;
    await Promise.resolve();
    expect([...document.querySelectorAll('ul.users li')].map((li) => li.textContent)).toEqual(['ana']);
    expect(between()).toEqual(['users']);

    const broken = failed(500, 'Roto');
    refresh.next!({ users: broken });
    await broken;
    await Promise.resolve();
    expect(text('p.error')).toBe('Roto');
    expect(between()).toEqual(['error']);

    const back = ok(['bea', 'carla']);
    refresh.next!({ users: back });
    await back;
    await Promise.resolve();
    expect([...document.querySelectorAll('ul.users li')].map((li) => li.textContent)).toEqual(['bea', 'carla']);
    expect(between()).toEqual(['users']);
    expect(document.querySelector('main > :last-child')!.className).toBe('after');
  });
});

describe('an `@await` of something that is not a field of `data` (FUD1320)', () => {
  it('picks no block on the client, as the server paints none', () => {
    const route = ['@code { const n = signal(1); }', '<p>@n()</p>', '@await n { <p>x</p> }'].join('\n');
    const code = emitRouteClientModule(routeGraph(route))!;
    expect(code).toContain('const $q0 = () => -1;');
  });
});
