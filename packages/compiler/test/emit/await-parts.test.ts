/**
 * SDD-70 §3.5, §4.2 — the server render in parts, criteria 9, 10, 12, 13, 15 and 16.
 *
 * A page with `@await` goes out in parts: part 0 is the `<head>` and the body up to the first
 * `@await`, and each `@await` starts a new one, with its block in front and `<!--fud-end-->`
 * behind. Every case runs the REAL emitted modules (page, layout, components) against the real
 * `@fudic/ssr`, `PageParts` included, and reads the `ReadableStream` of `htmlToByteStream` chunk
 * by chunk. The `later` fields are promises resolved by hand — already settled the way
 * `runLoad` settles them (`{ ok }` or `{ error, cause }`) — so no test waits on a real timer.
 *
 * Both shapes of a page: a standalone one, which owns its shell, and a route with a layout.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { htmlToByteStream, PageParts, type HtmlPiece } from '@fudic/ssr';
import { resolveDocument } from '../../src/emit/resolve.js';
import {
  emitComponentModule,
  emitLayoutModule,
  emitPageModule,
  emitRouteModule,
} from '../../src/emit/index.js';
import type { LinkedApi, ResolveIo } from '../../src/types/io.js';
import { memoryIo, ssrIo, type PageFn, type Pieces } from './_support.js';

// ── fixtures ────────────────────────────────────────────────────────────────

/** A hydratable (N3) component: browser code and a handler, so each instance claims an id. */
const COUNTER = [
  '@code { let n = 0; function mas() { n += 1; } }',
  '<app-counter><template shadowrootmode="open">',
  '<button @click=@mas>+1</button>',
  '</template></app-counter>',
].join('\n');

/** The layout, with the runtime marker in one of its two forms (BUG-31 §T1, SDD-45 §3.6). */
const layoutOf = (marker: string): string => [
  `<!DOCTYPE html><html><head>@RenderHead()<script src="${marker}"></script></head>`,
  '<body><nav>menu</nav>',
  '<main>@RenderBody()</main>',
  '<footer>pie</footer>',
  '</body></html>',
].join('\n');
const LAYOUT = layoutOf('fudic:runtime');

/** The view both shapes share: something before, two `@await`, something after. */
const VIEW = [
  '<h1>Usuarios</h1>',
  '<app-counter></app-counter>',
  '@await data.users {',
  '  <ul>@foreach (const u of data.users) key (u) { <li>@u</li> }</ul>',
  '  <app-counter></app-counter>',
  '} @catch (e) {',
  '  <p class="error">@e.status @e.title @e.detail</p>',
  '}',
  '@await data.stats {',
  '  <p class="stats">@data.stats personas</p>',
  '  <app-counter></app-counter>',
  '}',
  '<p class="after">fin</p>',
].join('\n');

function standalone(view: string, head = ''): string {
  return [
    '<!DOCTYPE html><html><head><title>t</title>',
    '<link rel="component" href="./c.fud">',
    '<script src="fudic:runtime"></script>',
    head,
    '</head><body><main>',
    view,
    '</main></body></html>',
  ].join('\n');
}

function routed(view: string, code = ''): string {
  return [
    '<link rel="layout" href="./l.fud">',
    '<link rel="component" href="./c.fud">',
    '<link rel="server" href="./r.fudapi">',
    code,
    view,
  ].join('\n');
}

/** The facts of `r.fudapi`, as a host hands them over (SDD-60 §3.14). */
const API: LinkedApi = {
  id: 'routes/r',
  load: true,
  route: '/r.fud',
  paths: false,
  layout: false,
  functions: [],
  forms: [],
  later: ['users', 'stats'],
};

// ── the harness ─────────────────────────────────────────────────────────────

type Shape = 'standalone' | 'layout';

/**
 * Emit every module of the graph to a temp dir and import the entry's `page`: the components,
 * the layout and the page, as `build.ts` lays them out, each importing the next by specifier.
 */
async function pageOf(
  shape: Shape,
  source: string,
  routeName?: string,
  layout = LAYOUT,
  api: LinkedApi = API,
): Promise<{ page: PageFn; module: string }> {
  const entry = shape === 'standalone' ? '/p.fud' : '/r.fud';
  const io: ResolveIo = {
    ...memoryIo({ [entry]: source, '/l.fud': layout, '/c.fud': COUNTER }),
    api: (path) => (path === '/r.fudapi' ? api : undefined),
  };
  const graph = resolveDocument(entry, io).value;
  const dir = mkdtempSync(join(tmpdir(), 'fudic-parts-'));
  for (const comp of graph.components.values()) {
    writeFileSync(join(dir, `${comp.tag}.mjs`), emitComponentModule(graph, comp), 'utf8');
  }
  const options = routeName === undefined ? {} : { routeName };
  let module: string;
  if (shape === 'standalone') {
    module = emitPageModule(graph, options);
  } else {
    writeFileSync(join(dir, 'l.mjs'), emitLayoutModule(graph, graph.layouts[0]!), 'utf8');
    module = emitRouteModule(graph, options);
  }
  writeFileSync(join(dir, 'entry.mjs'), module, 'utf8');
  const mod = (await import(pathToFileURL(join(dir, 'entry.mjs')).href)) as { page: PageFn };
  return { page: mod.page, module };
}

/** What `page` yields, as the wrapper streams it. */
const streamOf = (pieces: Pieces): ReadableStream<Uint8Array> =>
  htmlToByteStream(pieces as AsyncIterable<HtmlPiece>);

const RUNTIME = { boot: '', main: '/main.js', pieces: [], inline: '' };

/** The real `@fudic/ssr` as `io`, with the parts and where an uncaught `later` failure goes. */
function partsIo(errors: unknown[] = []): Record<string, unknown> {
  return {
    ...(ssrIo().io as Record<string, unknown>),
    parts: (dom: never, body: never, options: never) => new PageParts(dom, body, options),
    onError: (error: unknown) => errors.push(error),
    runtime: RUNTIME,
  };
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** A `later` field, settled the way `runLoad` settles it, resolved by hand. */
const later = (): Deferred<unknown> => deferred<unknown>();

/** Reads a byte stream one chunk at a time; `next` resolves with `null` at the end. */
function chunks(stream: ReadableStream<Uint8Array>): { next: () => Promise<string | null>; pending: () => Promise<boolean> } {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let inFlight: Promise<string | null> | undefined;
  const read = (): Promise<string | null> =>
    reader.read().then(({ done, value }) => (done ? null : decoder.decode(value)));
  return {
    next: () => {
      const p = inFlight ?? read();
      inFlight = undefined;
      return p;
    },
    /** Whether the next chunk is still not there after the microtasks have drained. */
    pending: async () => {
      inFlight ??= read();
      let arrived = false;
      void inFlight.then(() => (arrived = true));
      await new Promise<void>((r) => setImmediate(r));
      return !arrived;
    },
  };
}

/** Everything left in the stream. */
async function rest(reader: ReturnType<typeof chunks>): Promise<string> {
  let out = '';
  for (let c = await reader.next(); c !== null; c = await reader.next()) out += c;
  return out;
}

const BLOCK = /<script type="application\/json" data-fud-part="(\d+)">(.*?)<\/script>/gu;

function blocks(html: string): Map<number, Record<string, unknown>> {
  return new Map([...html.matchAll(BLOCK)].map((m) => [Number(m[1]), JSON.parse(m[2]!) as Record<string, unknown>]));
}

const SHAPES: readonly Shape[] = ['standalone', 'layout'];
const sourceOf = (shape: Shape, view = VIEW): string => (shape === 'standalone' ? standalone(view) : routed(view));

// ── criterion 9 ─────────────────────────────────────────────────────────────

describe.each(SHAPES)('criterion 9 — the first byte does not wait (%s)', (shape) => {
  it('the head and part 0 arrive as the first chunk while the later field is still pending, under 8 KB', async () => {
    const { page } = await pageOf(shape, sourceOf(shape));
    const users = later();
    const stats = later();
    const reader = chunks(streamOf(page({ users: users.promise, stats: stats.promise }, partsIo())));

    const first = (await reader.next())!;
    expect(new TextEncoder().encode(first).length).toBeLessThan(8192);
    expect(first.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(first).toContain('</head><body');
    expect(first).toContain('<h1>Usuarios</h1>');
    expect(first.endsWith('<!--fud-end-->')).toBe(true);
    expect(first).not.toContain('<ul>');
    // Nothing else comes while `users` is pending.
    expect(await reader.pending()).toBe(true);

    users.resolve({ ok: ['Ana'] });
    stats.resolve({ ok: 1 });
    const tail = await rest(reader);
    expect(tail).toContain('<li>Ana</li>');
    expect(tail.endsWith('</html>')).toBe(true);
  });
});

// ── criterion 10 ────────────────────────────────────────────────────────────

describe.each(SHAPES)('criterion 10 — in order (%s)', (shape) => {
  it('two fields that settle in reverse: the part of the first goes out before the part of the second', async () => {
    const { page } = await pageOf(shape, sourceOf(shape));
    const users = later();
    const stats = later();
    const reader = chunks(streamOf(page({ users: users.promise, stats: stats.promise }, partsIo())));
    await reader.next();

    // The second settles first: its part waits for the first one's.
    stats.resolve({ ok: 12 });
    expect(await reader.pending()).toBe(true);

    users.resolve({ ok: ['Ana', 'Luis'] });
    const second = (await reader.next())!;
    expect(second).toMatch(/<li>Ana<\/li>\s*<li>Luis<\/li>/u);
    expect(second).not.toContain('class="stats"');

    const tail = await rest(reader);
    expect(tail).toContain('<p class="stats">12 personas</p>');
    expect(tail).toContain('<p class="after">fin');
  });
});

// ── criterion 12 ────────────────────────────────────────────────────────────

describe.each(SHAPES)('criterion 12 — the format (%s)', (shape) => {
  it('each part: its block in front, its marker behind; the state of its own instances; the ids keep counting', async () => {
    const { page } = await pageOf(shape, sourceOf(shape));
    const html = (await rest(
      chunks(streamOf(page({ users: Promise.resolve({ ok: ['Ana'] }), stats: Promise.resolve({ ok: 3 }) }, partsIo()))),
    ));

    // Three parts, three markers; one block each, in front of what it describes.
    expect(html.match(/<!--fud-end-->/gu)).toHaveLength(3);
    const parts = html.split('<!--fud-end-->');
    parts.slice(0, 3).forEach((part, i) => {
      expect(part).toContain(`data-fud-part="${i}"`);
      expect([...part.matchAll(BLOCK)]).toHaveLength(1);
    });
    // The block of part 0 goes inside the `<body>`, before anything it painted.
    expect(parts[0]!.indexOf('data-fud-part="0"')).toBeGreaterThan(parts[0]!.indexOf('<body'));
    expect(parts[0]!.indexOf('data-fud-part="0"')).toBeLessThan(parts[0]!.indexOf('<h1>'));
    expect(parts[1]!.indexOf('data-fud-part="1"')).toBeLessThan(parts[1]!.indexOf('<ul>'));

    // Each instance claimed once, in the part that painted it; the ids keep counting.
    expect(parts[0]).toContain('<app-counter data-fud-id="0">');
    expect(parts[1]).toContain('<app-counter data-fud-id="1">');
    expect(parts[2]).toContain('<app-counter data-fud-id="2">');
    const state = [...blocks(html)].map(([i, b]) => [i, (b['state'] as [number, number[], unknown[]])[0], (b['state'] as [number, number[]])[1].length - 1]);
    expect(state).toEqual([
      [0, 0, 1],
      [1, 1, 1],
      [2, 2, 1],
    ]);
    // No end-of-body blocks of a page in one piece.
    expect(html).not.toContain('id="fud-state"');
    expect(html).not.toContain('id="fud-tree"');
  });

  it('with no instance in a part and nothing to say, the part has no block, only its marker', async () => {
    const view = '<h1>x</h1>\n@await data.users { <p>@data.users</p> }\n<p>y</p>';
    const { page } = await pageOf(shape, sourceOf(shape, view));
    const html = (await rest(chunks(streamOf(page({ users: Promise.resolve({ ok: 'u' }) }, partsIo())))));
    expect(html).not.toContain('data-fud-part');
    expect(html.match(/<!--fud-end-->/gu)).toHaveLength(2);
    expect(html).toContain('<p>u</p>');
  });
});

describe('criterion 12 — a hydratable route publishes its route and data in part 0, its fields where awaited', () => {
  const code = '@code { const n = signal(1); function saluda() { alert(data.title); } }\n<output>@n()</output>';
  const view = '@await data.users { <p>@data.users</p> }';

  /** What `dataShape` gives of this `load`: its `later` fields are not in it (§3.5). */
  const shaped: LinkedApi = { ...API, data: { fields: { title: 'str' }, types: {} } };

  it('the route claims the `<body>` first: its id is 0, and part 0 carries `route` and `data`', async () => {
    const { page } = await pageOf('layout', routed(view, code), 'r', LAYOUT, shaped);
    const html = (await rest(
      chunks(streamOf(page({ title: 'T', users: Promise.resolve({ ok: 'u' }) }, partsIo()))),
    ));
    expect(html).toContain('<body data-fud-id="0">');
    const all = blocks(html);
    // The `<body>`'s own slice is the first of part 0; `data` packed by its shape, `users` not in it.
    expect(all.get(0)).toEqual({ route: 'r', data: ['T'], state: [0, [0, 0], []] });
    expect(all.get(1)).toEqual({ fields: { users: { ok: 'u' } } });
  });

  it('without a data shape, `data` still leaves the `later` fields out, by root or whole', async () => {
    const byRoot = await pageOf('layout', routed(view, code), 'r', LAYOUT, API);
    const html = await rest(
      chunks(streamOf(byRoot.page({ title: 'T', users: Promise.resolve({ ok: 'u' }) }, partsIo()))),
    );
    expect(blocks(html).get(0)).toEqual({ route: 'r', data: { title: 'T' }, state: [0, [0, 0], []] });

    const whole = '@code { const n = signal(1); function saluda() { console.log(data); } }\n<output>@n()</output>';
    const all = await pageOf('layout', routed(view, whole), 'r', LAYOUT, API);
    const html2 = await rest(
      chunks(streamOf(all.page({ title: 'T', users: Promise.resolve({ ok: 'u' }) }, partsIo()))),
    );
    expect(blocks(html2).get(0)).toMatchObject({ data: { title: 'T' } });
  });

  it('a field that failed travels as its Problem, never as its cause', async () => {
    const { page } = await pageOf('layout', routed(view, code), 'r', LAYOUT, shaped);
    const failed = { error: { status: 404, title: 'Not Found' }, cause: new Error('secret') };
    const html = (await rest(chunks(streamOf(page({ title: 'T', users: Promise.resolve(failed) }, partsIo())))));
    expect(blocks(html).get(1)).toEqual({ fields: { users: { error: { status: 404, title: 'Not Found' } } } });
    expect(html).not.toContain('secret');
  });
});

// ── criterion 13 ────────────────────────────────────────────────────────────

describe.each(SHAPES)('criterion 13 — the errors (%s)', (shape) => {
  async function renderWith(users: unknown, errors: unknown[] = []): Promise<string> {
    const { page } = await pageOf(shape, sourceOf(shape));
    return rest(chunks(streamOf(page({ users: Promise.resolve(users), stats: Promise.resolve({ ok: 1 }) }, partsIo(errors)))));
  }

  it('a rejection with notFound() paints the @catch with e.status 404', async () => {
    const html = await renderWith({ error: { status: 404, title: 'Not Found' }, cause: new Error('x') });
    expect(html).toContain('<p class="error">404 Not Found </p>');
    expect(html).not.toContain('<ul>');
    // What follows still paints.
    expect(html).toContain('<p class="stats">1 personas</p>');
  });

  it('a plain Error paints the @catch with 500, with the detail it carries (only dev settles one)', async () => {
    const dev = await renderWith({ error: { status: 500, title: 'Internal Server Error', detail: 'db down' }, cause: new Error('db down') });
    expect(dev).toContain('<p class="error">500 Internal Server Error db down</p>');
    const prod = await renderWith({ error: { status: 500, title: 'Internal Server Error' }, cause: new Error('db down') });
    expect(prod).toContain('<p class="error">500 Internal Server Error </p>');
    expect(prod).not.toContain('db down');
  });

  it('without a @catch the part is empty, the error goes to onError, and what follows paints', async () => {
    const { page } = await pageOf(shape, sourceOf(shape));
    const errors: unknown[] = [];
    const cause = new Error('stats failed');
    const html = await rest(
      chunks(
        streamOf(
          page({ users: Promise.resolve({ ok: [] }), stats: Promise.resolve({ error: { status: 500, title: 'x' }, cause }) }, partsIo(errors)),
        ),
      ),
    );
    expect(errors).toEqual([cause]);
    expect(html).not.toContain('class="stats"');
    const parts = html.split('<!--fud-end-->');
    expect(parts).toHaveLength(4);
    expect(parts[2]).toContain('<p class="after">fin');
  });

  it('without onError in io, the failure is simply not painted', async () => {
    const { page } = await pageOf(shape, sourceOf(shape));
    const io = partsIo();
    delete io['onError'];
    const html = await rest(
      chunks(streamOf(page({ users: Promise.resolve({ ok: [] }), stats: Promise.resolve({ error: { status: 500, title: 'x' }, cause: 1 }) }, io))),
    );
    expect(html).toContain('<p class="after">fin');
  });
});

// ── criterion 15 ────────────────────────────────────────────────────────────

describe.each(SHAPES)('criterion 15 — a field in a branch that does not paint is never awaited (%s)', (shape) => {
  it('the render ends without waiting for it', async () => {
    const view = '<h1>x</h1>\n@if (data.show) { @await data.users { <p>@data.users</p> } }\n<p>y</p>';
    const { page } = await pageOf(shape, sourceOf(shape, view));
    const never = later();
    const html = await rest(chunks(streamOf(page({ show: false, users: never.promise }, partsIo()))));
    expect(html).toContain('<p>y');
    expect(html.match(/<!--fud-end-->/gu)).toHaveLength(1);
    expect(html.endsWith('</html>')).toBe(true);
  });
});

// ── criterion 16 ────────────────────────────────────────────────────────────

describe('criterion 16 — without @await nothing changes; with one, the runtime goes `async`', () => {
  const plain = '<h1>x</h1>\n<app-counter></app-counter>';

  it('a standalone page without @await is the plain generator, with its blocks at the end', async () => {
    const { page, module } = await pageOf('standalone', standalone(plain));
    expect(module).toContain('export function* page(data, io, $ioc) {');
    expect(module).not.toContain('$parts');
    const html = await rest(chunks(streamOf(page({}, partsIo()))));
    expect(html).toContain('<script type="module" src="/main.js"></script>');
    expect(html).not.toContain('async');
    expect(html).not.toContain('fud-end');
    expect(html).not.toContain('data-fud-part');
    expect(html).toContain('id="fud-state"');
  });

  it('a standalone page with one is an async generator, and its runtime tag carries `async`', async () => {
    const { module } = await pageOf('standalone', standalone(VIEW));
    expect(module).toContain('export async function* page(data, io, $ioc) {');
    const { page } = await pageOf('standalone', standalone(VIEW));
    const html = await rest(chunks(streamOf(page({ users: Promise.resolve({ ok: [] }), stats: Promise.resolve({ ok: 1 }) }, partsIo()))));
    expect(html).toContain('<script type="module" async src="/main.js"></script>');
  });

  it('a route without @await writes the bytes it always did through its async layout', async () => {
    const { page, module } = await pageOf('layout', routed(plain));
    expect(module).not.toContain('$parts');
    const html = await rest(chunks(streamOf(page({}, partsIo()))));
    expect(html).not.toContain('async');
    expect(html).not.toContain('fud-end');
    expect(html).toContain('id="fud-state"');
  });

  it('a route with one carries `async` on its runtime tag, in both forms', async () => {
    const { page } = await pageOf('layout', routed(VIEW));
    const data = { users: Promise.resolve({ ok: [] }), stats: Promise.resolve({ ok: 1 }) };
    const file = await rest(chunks(streamOf(page(data, partsIo()))));
    expect(file).toContain('<script type="module" async src="/main.js"></script>');

    const inline = (await pageOf('layout', routed(VIEW), undefined, layoutOf('fudic:runtime?inline'))).page;
    const io = { ...partsIo(), nonce: 'n1', runtime: { ...RUNTIME, inline: 'boot()' } };
    const inlined = await rest(chunks(streamOf(inline(data, io))));
    expect(inlined).toContain('<script type="module" async nonce="n1">boot()</script>');
    // A build without the inline source falls back to the file, `async` all the same.
    const fallback = await rest(chunks(streamOf(inline(data, partsIo()))));
    expect(fallback).toContain('<script type="module" async src="/main.js"></script>');
  });

  it('a route without one keeps its runtime tag as it was, in both forms', async () => {
    const { page } = await pageOf('layout', routed(plain));
    expect(await rest(chunks(streamOf(page({}, partsIo()))))).toContain('<script type="module" src="/main.js"></script>');
    const inline = (await pageOf('layout', routed(plain), undefined, layoutOf('fudic:runtime?inline'))).page;
    const io = { ...partsIo(), runtime: { ...RUNTIME, inline: 'boot()' } };
    expect(await rest(chunks(streamOf(inline({}, io))))).toContain('<script type="module">boot()</script>');
  });
});

// ── what part 0 carries, and where nothing is cut ───────────────────────────

describe('the opening of a page in parts (§3.5)', () => {
  /** A component the route hands a signal to: the route's entry in `fud-tree`. */
  const DISPLAY = [
    '@code { const { count } = props<{ count: Signal<number> }>(); }',
    '<signal-display><template shadowrootmode="open">',
    '<output>@count()</output>',
    '</template></signal-display>',
  ].join('\n');
  /** An emitter and a listener of `carrito`: an entry in `fud-bus`. */
  const EMITTER = [
    '@code {',
    "  import { emit } from '@fudic/dom';",
    "  function go(p) { emit('carrito', p); }",
    '}',
    '<app-emitter><template shadowrootmode="open"><button @click="@go">go</button></template></app-emitter>',
  ].join('\n');
  const LISTENER = '<app-listener><template shadowrootmode="open"><ul bus:carrito="@onCarrito($event)"></ul></template></app-listener>';
  /** A component that injects: the request's container travels with the parts. */
  const CART = [
    '@code {',
    "  import { inject } from '@fudic/di';",
    "  import { Cart } from './cart.js';",
    '  const cart = inject(Cart);',
    '}',
    '<app-cart><template shadowrootmode="open"><p>@cart.n</p></template></app-cart>',
  ].join('\n');
  const LINKS = ['d', 'e', 's', 'k'].map((f) => `<link rel="component" href="./${f}.fud">`).join('\n');
  const TAGS = '<app-emitter></app-emitter><app-listener></app-listener><app-cart></app-cart>';
  const FILES = { '/d.fud': DISPLAY, '/e.fud': EMITTER, '/s.fud': LISTENER, '/k.fud': CART, '/l.fud': LAYOUT };
  /** A route that hands a prop and runs an effect: in `fud-tree` and in `fud-eager` by its name. */
  const CODE = '@code { const count = signal(1); effect(() => { count(); }); }';
  const AWAIT = '@await data.users { <p>ok</p> }';

  const openingOf = (module: string): string => /\$parts = io\.parts\((.*)\);/u.exec(module)?.[1] ?? '';

  it('a route: the static maps, its name and the container, all in part 0', () => {
    const route = ['<link rel="layout" href="./l.fud">', LINKS, CODE, '<signal-display .count=@count></signal-display>', TAGS, AWAIT].join('\n');
    const graph = resolveDocument('/r.fud', memoryIo({ '/r.fud': route, ...FILES })).value;
    const opening = openingOf(emitRouteModule(graph, { routeName: 'ruta' }));
    expect(opening).toBe('$dom, $parent, { first: { tree: FUD_TREE, bus: FUD_BUS, eager: FUD_EAGER, route: "ruta" }, fields: false, ioc: $root }');
  });

  it('a standalone page: the same, from its own body', () => {
    const page = [
      '<!DOCTYPE html><html><head><title>t</title>',
      LINKS,
      CODE,
      '</head><body>',
      '<signal-display .count=@count></signal-display>',
      TAGS,
      AWAIT,
      '</body></html>',
    ].join('\n');
    const graph = resolveDocument('/p.fud', memoryIo({ '/p.fud': page, ...FILES })).value;
    const opening = openingOf(emitPageModule(graph, { routeName: 'pagina' }));
    expect(opening).toBe('$dom, $body, { first: { tree: FUD_TREE, bus: FUD_BUS, eager: FUD_EAGER, route: "pagina" }, fields: false, ioc: $root }');
  });

  it('an `@await` in the light DOM of a component: the host is in the tree before the cut', async () => {
    const card = '<x-card><template shadowrootmode="open"><div><slot></slot></div></template></x-card>';
    const page = standalone('<x-card><b>antes</b>@await data.users { <i>@data.users</i> }</x-card>').replace('./c.fud', './x.fud');
    const graph = resolveDocument('/p.fud', memoryIo({ '/p.fud': page, '/x.fud': card })).value;
    const dir = mkdtempSync(join(tmpdir(), 'fudic-parts-'));
    for (const comp of graph.components.values()) {
      writeFileSync(join(dir, `${comp.tag}.mjs`), emitComponentModule(graph, comp), 'utf8');
    }
    writeFileSync(join(dir, 'entry.mjs'), emitPageModule(graph), 'utf8');
    const { page: render } = (await import(pathToFileURL(join(dir, 'entry.mjs')).href)) as { page: PageFn };
    const users = later();
    const reader = chunks(streamOf(render({ users: users.promise }, partsIo())));
    const first = (await reader.next())!;
    // The host, its shadow root and what came before the `@await` leave in part 0.
    expect(first).toMatch(/<x-card><template shadowrootmode="open"><div><slot><\/slot><\/div><\/template><b>antes/u);
    users.resolve({ ok: 'luego' });
    const tail = await rest(reader);
    expect(tail).toContain('<i>luego</i>');
    expect(tail).toContain('</x-card>');
  });

  it('an `@await` that names no field cuts nothing; a component never cuts', () => {
    const page = standalone('@await data.users { <p>a</p> }\n@await signal() { <p>b</p> }');
    const graph = resolveDocument('/p.fud', memoryIo({ '/p.fud': page, '/c.fud': COUNTER })).value;
    expect(emitPageModule(graph).match(/\.cut\(/gu)).toHaveLength(1);

    const comp = '<x-a><template shadowrootmode="open">@await data.users { <p>a</p> }</template></x-a>';
    const host = standalone('<x-a></x-a>').replace('./c.fud', './x.fud');
    const withComp = resolveDocument('/p.fud', memoryIo({ '/p.fud': host, '/x.fud': comp })).value;
    const xa = [...withComp.components.values()].find((c) => c.tag === 'x-a')!;
    const module = emitComponentModule(withComp, xa);
    expect(module).not.toContain('.cut(');
    expect(module).not.toContain('<p>a</p>');
    expect(module).not.toContain('"a"');
  });
});
