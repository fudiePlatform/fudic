/**
 * SDD-39 §6.1–§6.2 — the `@code` of a route reaches BOTH sides.
 *
 * The first test is the `count is not defined` of §1.1, inverted: a route that declares its
 * reactive in its browser code and reads it from the markup has to PRERENDER, painting the
 * initial value. What makes that possible is the inert stub SDD-31 §4.6 already gives a
 * component, written now for the entry of a route.
 */

import { describe, expect, it } from 'vitest';
import { resolveDocument, emitLayoutModule, emitRouteModule, emitPageModule } from '../../src/emit/index.js';
import { resolveComponents } from '../../src/emit/resolve.js';
import type { LinkedApi, ResolveIo } from '../../src/types/io.js';
import { drain, memoryIo, minimalSsr, type PageFn } from './_support.js';

/** Evaluate an emitted module with its imports stripped and their bindings injected. */
function evalModule(code: string, bindings: Record<string, unknown>, returns: string): unknown {
  const body = code.replace(/^import[^\n]*\n/gmu, '').replace(/^export\s+/gmu, '') + `\nreturn ${returns};`;
  const names = Object.keys(bindings);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(...names, body)(...Object.values(bindings)) as unknown;
}

const SHELL =
  '<!DOCTYPE html><html><head>@RenderHead()</head><body>@RenderBody()</body></html>';

/** Emit route + layout from an in-memory graph, link them and run the document. */
async function renderRoute(
  routeSource: string,
  bindings: Record<string, unknown> = {},
  options: { routeName?: string } = {},
): Promise<string> {
  const io = memoryIo({ '/r.fud': routeSource, '/l.fud': SHELL });
  const graph = resolveDocument('/r.fud', io).value;
  const layout = evalModule(emitLayoutModule(graph, graph.layouts[0]!), bindings, 'layout');
  const page = evalModule(emitRouteModule(graph, options), { ...bindings, layout }, 'page') as PageFn;
  return drain(page({}, minimalSsr()));
}

describe('the `@code` of a route (§6.1)', () => {
  it('prerenders a reactive declared in the `@code`, painting its initial value', async () => {
    const html = await renderRoute(
      [
        '<link rel="layout" href="./l.fud">',
        '@code {',
        '  const count = signal(1);',
        '  function mas() { count.set(count() + 1); }',
        '}',
        '<output>@count()</output>',
      ].join('\n'),
    );
    expect(html).toContain('<output>1</output>');
  });

  it('paints a `computed` too — it renders inert as the function itself', async () => {
    const html = await renderRoute(
      [
        '<link rel="layout" href="./l.fud">',
        '@code {',
        '  const count = signal(2);',
        '  const doble = computed(() => count() * 2);',
        '}',
        '<p>@doble()</p>',
      ].join('\n'),
    );
    expect(html).toContain('<p>4</p>');
  });

  it('marks the `<body>` when the build knows what the route is called', async () => {
    const html = await renderRoute(
      [
        '<link rel="layout" href="./l.fud">',
        '@code { const count = signal(4); }',
        '<output>@count()</output>',
      ].join('\n'),
      {},
      { routeName: 'ruta' },
    );
    expect(html).toContain('<body data-fud-id="0">');
    expect(html).toContain('<output>4</output>');
  });

  it('reads the server cut on the server, in the order it was written', async () => {
    const html = await renderRoute(
      [
        '<link rel="layout" href="./l.fud">',
        '@code {',
        '  const uno = 1;',
        '  const dos = uno + 1;',
        '}',
        '<p>@dos</p>',
      ].join('\n'),
    );
    expect(html).toContain('<p>2</p>');
  });
});

describe('what the render module of a route carries (§6.2)', () => {
  // `load` lives in the linked `.fudapi` (SDD-60 §3.14); `secreto` is browser code the markup
  // never reads, so it is outside the server cut (§4.8).
  const source = [
    '<link rel="layout" href="./l.fud">',
    '<link rel="server" href="./r.fudapi">',
    '@code {',
    '  import { titulo } from "./meta.js";',
    '  const saludo = "hola";',
    '  const secreto = 1;',
    '  const count = signal(1);',
    '  function mas() { count.set(count() + secreto); }',
    '}',
    '<p>@saludo @titulo @count()</p>',
  ].join('\n');

  const api: LinkedApi = { id: 'routes/r', load: true, route: '/r.fud', paths: false, layout: false, functions: [], forms: [] };
  const ioOf = (): ResolveIo => ({
    ...memoryIo({ '/r.fud': source, '/l.fud': SHELL }),
    api: (path) => (path === '/r.fudapi' ? api : undefined),
  });

  const moduleOf = (): string => emitRouteModule(resolveDocument('/r.fud', ioOf()).value);

  it('writes the server cut whole — its import hoisted, its body inside `page`', () => {
    const code = moduleOf();
    expect(code).toContain('import { titulo } from "./meta.js";');
    expect(code).toContain('const saludo = "hola";');
    // Hoisted means at module scope: above the `page` generator, not inside it.
    expect(code.indexOf('import { titulo }')).toBeLessThan(code.indexOf('export async function* page'));
    expect(code.indexOf('const saludo')).toBeGreaterThan(code.indexOf('export async function* page'));
  });

  it('writes a reactive as an inert one and never the browser code around it', () => {
    const code = moduleOf();
    expect(code).toContain('const count = () => (1); // inert signal');
    expect(code).not.toContain('count.set');
  });

  it('carries neither the linked `load` nor what the markup does not read', () => {
    const code = moduleOf();
    expect(code).not.toContain('load');
    expect(code).not.toContain('secreto');
  });

  it('drops a `provide` of a route: there is no container of its own to register into', () => {
    const io = memoryIo({
      '/r.fud': [
        '<link rel="layout" href="./l.fud">',
        '@code {',
        '  import { provide } from "@fudic/di";',
        '  import { Cart } from "./cart.js";',
        '  provide(Cart, () => new Cart());',
        '}',
        '<p>x</p>',
      ].join('\n'),
      '/l.fud': SHELL,
    });
    const code = emitRouteModule(resolveDocument('/r.fud', io).value);
    // The import travels — it is hoisted like any other — and the registration does not:
    // `$own` is a component's, and a route resolves from the request's container (SDD-56 §3.8).
    expect(code).toContain('import { Cart } from "./cart.js";');
    expect(code).not.toContain('provideIn');
  });

  it('reads the `@code` of one document once, however many emitters ask', () => {
    const graph = resolveDocument('/r.fud', ioOf()).value;
    // Twice over the SAME graph: the second call comes out of the memo, which is the golden
    // rule — one Oxc invocation per file, whoever is asking.
    expect(emitRouteModule(graph)).toBe(emitRouteModule(graph));
  });
});

describe('a standalone page splits its `@code` the same way', () => {
  it('paints a reactive its `@code` declares', async () => {
    const io = memoryIo({
      '/p.fud': [
        '<!DOCTYPE html><html><head>',
        '@code { const n = signal(7); }',
        '</head><body><p>@n()</p></body></html>',
      ].join('\n'),
    });
    const graph = resolveComponents('/p.fud', io);
    const page = evalModule(emitPageModule(graph), {}, 'page') as PageFn;
    expect(await drain(page({}, minimalSsr()))).toContain('<p>7</p>');
  });
});
