/**
 * SDD-39 §6.1–§6.2 — the `@code` of a route reaches BOTH sides.
 *
 * The first test is the `count is not defined` of §1.1, inverted: a route that declares its
 * reactive inside `@client` and reads it from the markup has to PRERENDER, painting the
 * initial value. What makes that possible is the inert stub SDD-31 §4.6 already gives a
 * component, written now for the entry of a route.
 */

import { describe, expect, it } from 'vitest';
import { resolveDocument, emitLayoutModule, emitRouteModule, emitPageModule } from '../../src/emit/index.js';
import { resolveComponents } from '../../src/emit/resolve.js';
import { memoryIo, minimalSsr } from './_support.js';

type PageFn = (data: unknown, io: unknown) => Iterable<string>;

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
function renderRoute(
  routeSource: string,
  bindings: Record<string, unknown> = {},
  options: { routeName?: string } = {},
): string {
  const io = memoryIo({ '/r.fud': routeSource, '/l.fud': SHELL });
  const graph = resolveDocument('/r.fud', io).value;
  const layout = evalModule(emitLayoutModule(graph, graph.layouts[0]!), bindings, 'layout');
  const page = evalModule(emitRouteModule(graph, options), { ...bindings, layout }, 'page') as PageFn;
  return [...page({}, minimalSsr())].join('');
}

describe('the `@code` of a route (§6.1)', () => {
  it('prerenders a reactive declared inside `@client`, painting its initial value', () => {
    const html = renderRoute(
      [
        '<link rel="layout" href="./l.fud">',
        '@code {',
        '  @client {',
        '    const count = signal(1);',
        '    function mas() { count.set(count() + 1); }',
        '  }',
        '}',
        '<output>@count()</output>',
      ].join('\n'),
    );
    expect(html).toContain('<output>1</output>');
  });

  it('paints a `computed` of `@client` too — it renders inert as the function itself', () => {
    const html = renderRoute(
      [
        '<link rel="layout" href="./l.fud">',
        '@code { @client {',
        '  const count = signal(2);',
        '  const doble = computed(() => count() * 2);',
        '} }',
        '<p>@doble()</p>',
      ].join('\n'),
    );
    expect(html).toContain('<p>4</p>');
  });

  it('marks the `<body>` when the build knows what the route is called', () => {
    const html = renderRoute(
      [
        '<link rel="layout" href="./l.fud">',
        '@code { @client { const count = signal(4); } }',
        '<output>@count()</output>',
      ].join('\n'),
      {},
      { routeName: 'ruta' },
    );
    expect(html).toContain('<body data-fud-id="0">');
    expect(html).toContain('<output>4</output>');
  });

  it('reads the neutral zone on the server, in the order it was written', () => {
    const html = renderRoute(
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
  const source = [
    '<link rel="layout" href="./l.fud">',
    '@code {',
    '  import { titulo } from "./meta.js";',
    '  const saludo = "hola";',
    '  @server { export async function load() { return { secreto: 1 }; } }',
    '  @client { const count = signal(1); }',
    '}',
    '<p>@saludo</p>',
  ].join('\n');

  const moduleOf = (): string => {
    const io = memoryIo({ '/r.fud': source, '/l.fud': SHELL });
    return emitRouteModule(resolveDocument('/r.fud', io).value);
  };

  it('writes the neutral zone whole — its import hoisted, its body inside `page`', () => {
    const code = moduleOf();
    expect(code).toContain('import { titulo } from "./meta.js";');
    expect(code).toContain('const saludo = "hola";');
    // Hoisted means at module scope: above the `page` generator, not inside it.
    expect(code.indexOf('import { titulo }')).toBeLessThan(code.indexOf('export function* page'));
    expect(code.indexOf('const saludo')).toBeGreaterThan(code.indexOf('export function* page'));
  });

  it('writes `@client` as an inert reactive and never as its body', () => {
    const code = moduleOf();
    expect(code).toContain('const count = () => (1); // inert signal');
    expect(code).not.toContain('count.set');
  });

  it('does not carry the `@server` region in any form', () => {
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
    // `$own` is a component's, and a route resolves through `ctx.inject(…)` (SDD-38 §6.24).
    expect(code).toContain('import { Cart } from "./cart.js";');
    expect(code).not.toContain('provideIn');
  });

  it('reads the `@code` of one document once, however many emitters ask', () => {
    const io = memoryIo({ '/r.fud': source, '/l.fud': SHELL });
    const graph = resolveDocument('/r.fud', io).value;
    // Twice over the SAME graph: the second call comes out of the memo, which is the golden
    // rule — one Oxc invocation per file, whoever is asking.
    expect(emitRouteModule(graph)).toBe(emitRouteModule(graph));
  });
});

describe('a standalone page splits its `@code` the same way', () => {
  it('paints a reactive its `@client` declares', () => {
    const io = memoryIo({
      '/p.fud': [
        '<!DOCTYPE html><html><head>',
        '@code { @client { const n = signal(7); } }',
        '</head><body><p>@n()</p></body></html>',
      ].join('\n'),
    });
    const graph = resolveComponents('/p.fud', io);
    const page = evalModule(emitPageModule(graph), {}, 'page') as PageFn;
    expect([...page({}, minimalSsr())].join('')).toContain('<p>7</p>');
  });
});
