/**
 * SDD-40 §6.1–§6.6 — the props of a layout, and the `<html>` that can finally hold one.
 *
 * The centrepiece is §6.1, and it is written as the inversion of a shortcut: the shell's
 * opening tag used to reach the output through `JSON.stringify(slice(source, openSpan))`, so
 * `lang="@culture"` came out as those four characters. It goes through the attribute
 * machinery now, and the test that says so is the one that renders the module and reads the
 * `lang` back.
 *
 * A layout's `@code` lives inside its `<head>`, like a page's (decision 60) — a layout is
 * page-shaped. What SDD-40 changed is that it may exist at all: `FUD0437` said a layout
 * declares nothing, and a layout declares its props.
 */

import { describe, expect, it } from 'vitest';
import {
  resolveDocument,
  emitLayoutModule,
  emitLayoutModuleMapped,
  emitRouteModule,
  emitRouteModuleMapped,
  type ResolvedLayout,
} from '../../src/emit/index.js';
import { memoryIo, minimalSsr } from './_support.js';

const ROUTE = '<link rel="layout" href="./_layout.fud"><p>hola</p>';

/**
 * A layout source: its `@code` inside `<head>`, its own `<html>` attributes, its body.
 *
 * A nested layout has the same shape with a `<link rel="layout">` in its head (decision 87):
 * page-shaped either way, which is why its `@code` lives in `<head>` like a page's.
 */
function layoutSource(parts: {
  code?: string;
  html?: string;
  body?: string;
  parent?: string;
}): string {
  const code = parts.code === undefined ? '' : `@code {\n  ${parts.code}\n}\n  `;
  const link = parts.parent === undefined ? '' : `<link rel="layout" href="${parts.parent}">\n  `;
  return (
    '<!DOCTYPE html>\n' +
    `<html ${parts.html ?? 'lang="es"'}>\n` +
    `  <head>\n  ${link}${code}@RenderHead()\n  </head>\n` +
    `  <body ${parts.body ?? ''}>@RenderBody()</body>\n` +
    '</html>\n'
  );
}

/** Emit a one-layout chain from sources held in memory, entered through its route. */
function chain(layout: string, route = ROUTE): { layout: string; route: string } {
  const graph = resolveDocument(
    '/app/index.fud',
    memoryIo({ '/app/index.fud': route, '/app/_layout.fud': layout }),
  ).value;
  return {
    layout: emitLayoutModule(graph, graph.layouts[0]!),
    route: emitRouteModule(graph),
  };
}

interface Reported {
  readonly code: string;
  readonly span: { readonly start: number; readonly end: number };
}

/** The diagnostics the layout's own emit reports, as `{ code, span }`. */
function layoutDiagnostics(layout: string, route = ROUTE): readonly Reported[] {
  const graph = resolveDocument(
    '/app/index.fud',
    memoryIo({ '/app/index.fud': route, '/app/_layout.fud': layout }),
  ).value;
  return emitLayoutModuleMapped(graph, graph.layouts[0]!).diagnostics.map((d) => ({
    code: d.code,
    span: { start: d.span.start, end: d.span.end },
  }));
}

/**
 * Link the two modules in memory and run the composition, returning the document.
 *
 * `new Function` over the emitted text with the imports stripped, exactly as the SDD-21 suite
 * does it: what is under test is what the modules PRODUCE, not that a bundler could link them.
 */
function render(sources: { layout: string; route: string }, props: unknown, data: unknown = {}): string {
  const evaluate = (code: string, bindings: Record<string, unknown>, returns: string): unknown => {
    const body =
      code.replace(/^import[^\n]*\n/gmu, '').replace(/^export\s+/gmu, '') + `\nreturn ${returns};`;
    const names = Object.keys(bindings);
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    return new Function(...names, body)(...Object.values(bindings)) as unknown;
  };
  const layout = evaluate(sources.layout, {}, 'layout');
  const page = evaluate(sources.route, { layout }, 'page') as (
    data: unknown,
    io: unknown,
    ioc: unknown,
    props: unknown,
  ) => Iterable<string>;
  return [...page(data, { ...minimalSsr(), nonce: '' }, undefined, props)].join('');
}

/** The span of `needle` in `source`, which is how every diagnostic here is anchored. */
const at = (source: string, needle: string): { start: number; end: number } => ({
  start: source.indexOf(needle),
  end: source.indexOf(needle) + needle.length,
});

describe('§6.1 — the `<html>` is interpolated, not sliced out of the source', () => {
  const layout = layoutSource({
    code: 'const { culture } = props<{ culture: string }>();',
    html: 'lang="@culture"',
  });
  const sources = chain(layout);

  it('emits the opening tag through the attribute machinery', () => {
    // The shortcut is gone: no `JSON.stringify` of the author's own tag text.
    expect(sources.layout).not.toContain('<html lang=\\"@culture\\">');
    expect(sources.layout).toContain("let $open = '<html';");
    expect(sources.layout).toContain("yield '<!DOCTYPE html>' + $open + '<head>' + head + '</head>';");
  });

  it('renders the `lang` the route resolved, and not the text `@culture`', () => {
    const html = render(sources, { culture: 'gl' });
    expect(html).toContain('<html lang="gl">');
    expect(html).not.toContain('@culture');
  });

  it('escapes it the way the serializer would', () => {
    expect(render(sources, { culture: 'a"b&c' })).toContain('<html lang="a&quot;b&amp;c">');
  });

  it('omits the attribute when the value is nullish (decision 21)', () => {
    expect(render(sources, {})).toContain('<html>');
  });

  it('keeps a static attribute a static attribute', () => {
    const plain = chain(layoutSource({ html: 'lang="es" dir="ltr"' }));
    expect(render(plain, undefined)).toContain('<html lang="es" dir="ltr">');
  });
});

describe('§6.5 — the props reach the layout, destructured above the first yield', () => {
  const layout = layoutSource({
    code: 'const { culture, theme = "light" } = props<{ culture: string; theme?: string }>();',
    html: 'lang="@culture"',
    body: 'data-theme="@theme"',
  });

  it('takes them as a fifth parameter and destructures them at the top', () => {
    const body = chain(layout).layout;
    const opens = body.indexOf('export function* layout(');
    expect(body).toContain('export function* layout(data, io, route, $ioc, $props) {');
    expect(body.indexOf('const { culture, theme = "light" } = $props ?? {};')).toBeGreaterThan(opens);
    expect(body.indexOf('const { culture, theme = "light" } = $props ?? {};')).toBeLessThan(
      body.indexOf('yield'),
    );
  });

  it('the route carries them and never reads them', () => {
    const route = chain(layout).route;
    expect(route).toContain('export function* page(data, io, $ioc, $props) {');
    expect(route).toContain('}, $ioc, $props);');
  });

  it('uses the default of a prop the route did not resolve, with no diagnostic (§6.3)', () => {
    const html = render(chain(layout), { culture: 'es' });
    expect(html).toContain('<html lang="es">');
    expect(html).toContain('data-theme="light"');
    expect(layoutDiagnostics(layout)).toEqual([]);
  });

  it('writes no destructuring at all for a layout that declares nothing', () => {
    expect(chain(layoutSource({})).layout).not.toContain('$props ?? {}');
  });
});

describe('§6.6 — one layout, one namespace: nothing is inherited because nothing is above', () => {
  const OUTER = layoutSource({
    code: 'const { culture } = props<{ culture: string }>();',
    html: 'lang="@culture"',
  });

  it('takes only its OWN names, and the props object reaches it whole', () => {
    const io = memoryIo({
      '/app/index.fud': '<link rel="layout" href="./_outer.fud"><p>hola</p>',
      '/app/_outer.fud': OUTER,
    });
    const graph = resolveDocument('/app/index.fud', io).value;
    expect(emitLayoutModule(graph, graph.layouts[0]!)).toContain(
      'const { culture } = $props ?? {};',
    );
  });

  it('says nothing about a name a DIFFERENT layout spells otherwise (was FUD0703)', () => {
    // Two layouts declaring `culture` as two types used to be a clash, because one render
    // resolved one object for the whole chain. Now each is the only layout of its own render,
    // and neither is in a position to contradict the other.
    const other = layoutSource({ code: 'const { culture } = props<{ culture: number }>();' });
    const io = memoryIo({
      '/app/index.fud': '<link rel="layout" href="./_other.fud"><p>hola</p>',
      '/app/_other.fud': other,
      '/app/_outer.fud': OUTER,
    });
    const graph = resolveDocument('/app/index.fud', io).value;
    expect(emitLayoutModuleMapped(graph, graph.layouts[0]!).diagnostics).toEqual([]);
  });

  it('emits a layout that wrongly names a layout without inheriting anything', () => {
    // `FUD0439` is the structuring pass's to report, not the emit's. What the emit must do
    // is treat the file as the plain layout it degraded into: its own props, its own shell.
    const offender = layoutSource({
      parent: './_outer.fud',
      code: 'const { culture } = props<{ culture: number }>();',
    });
    const io = memoryIo({
      '/app/index.fud': '<link rel="layout" href="./_inner.fud"><p>hola</p>',
      '/app/_inner.fud': offender,
      '/app/_outer.fud': OUTER,
    });
    const graph = resolveDocument('/app/index.fud', io).value;
    const emitted = emitLayoutModuleMapped(graph, graph.layouts[0]!);
    expect(emitted.diagnostics).toEqual([]);
    expect(emitted.code).toContain('const { culture } = $props ?? {};');
    expect(emitted.code).toContain('<!DOCTYPE html>');
  });
});

describe('§6.3 — `FUD0702`: a required prop the route does not resolve', () => {
  const LAYOUT = layoutSource({
    code: 'const { culture, theme = "light" } = props<{ culture: string; theme?: string }>();',
    html: 'lang="@culture"',
  });

  /** The diagnostics the ROUTE's emit reports — the build's side of the contract. */
  function routeDiagnostics(route: string): readonly Reported[] {
    const graph = resolveDocument(
      '/app/index.fud',
      memoryIo({ '/app/index.fud': route, '/app/_layout.fud': LAYOUT }),
    ).value;
    return emitRouteModuleMapped(graph).diagnostics.map((d) => ({
      code: d.code,
      span: { start: d.span.start, end: d.span.end },
    }));
  }

  const LINK = '<link rel="layout" href="./_layout.fud">';

  it('reports it over the `<link rel="layout">` when the route exports no resolver', () => {
    const route = `${LINK}<p>hola</p>`;
    expect(routeDiagnostics(route)).toEqual([{ code: 'FUD0702', span: at(route, LINK) }]);
  });

  it('reports it over a resolver that returns an empty object', () => {
    const route =
      `${LINK}\n@code {\n@server {\n` +
      'export function layout(ctx, data) { return {}; }\n}\n}\n<p>hola</p>';
    expect(routeDiagnostics(route).map((d) => d.code)).toEqual(['FUD0702']);
  });

  it('reads a resolver exported through a clause, and one exported through none', () => {
    // `export { layout }` names its bindings on the other side of the statement, where this
    // pass has no declaration to walk into — so it reads as a route that resolves nothing.
    const clause =
      `${LINK}\n@code {\n@server {\n` +
      'function layout(ctx, data) { return { culture: "es" }; }\nexport { layout };\n}\n}\n<p>hola</p>';
    expect(routeDiagnostics(clause).map((d) => d.code)).toEqual(['FUD0702']);
  });

  it('reports it when the resolver returns everything but that prop', () => {
    const route =
      `${LINK}\n@code {\n@server {\n` +
      'export function layout(ctx, data) { return { theme: "dark" }; }\n}\n}\n<p>hola</p>';
    expect(routeDiagnostics(route).map((d) => d.code)).toEqual(['FUD0702']);
  });

  it('says nothing once the route resolves it', () => {
    const route =
      `${LINK}\n@code {\n@server {\n` +
      'export function layout(ctx, data) { return { culture: "es" }; }\n}\n}\n<p>hola</p>';
    expect(routeDiagnostics(route)).toEqual([]);
  });

  it('reads an arrow resolver whose body IS its return', () => {
    const resolves =
      `${LINK}\n@code {\n@server {\n` +
      'export const layout = (ctx, data) => ({ culture: "es" });\n}\n}\n<p>hola</p>';
    expect(routeDiagnostics(resolves)).toEqual([]);
    // And the other half, which is what makes the first one mean something: silence there has
    // to be «it resolves it», not «this shape was never read». The parentheses around the
    // object are the grammar's — without them the `{` would open a block — so a reader that
    // did not unwrap them called every arrow unreadable and never said a word about any.
    const drops =
      `${LINK}\n@code {\n@server {\n` +
      'export const layout = (ctx, data) => ({ theme: "dark" });\n}\n}\n<p>hola</p>';
    expect(routeDiagnostics(drops).map((d) => d.code)).toEqual(['FUD0702']);
  });

  it('walks past an export that declares neither a function nor a binding', () => {
    const route =
      `${LINK}\n@code {\n@server {\n` +
      'export type Shape = { a: 1 };\nexport class Helper {}\n' +
      'export function layout(ctx, data) { return { culture: "es" }; }\n}\n}\n<p>hola</p>';
    expect(routeDiagnostics(route)).toEqual([]);
  });

  it('never complains about a prop with a default: the default IS the answer', () => {
    const route =
      `${LINK}\n@code {\n@server {\n` +
      'export function layout(ctx, data) { return { culture: "es" }; }\n}\n}\n<p>hola</p>';
    expect(routeDiagnostics(route).map((d) => d.code)).not.toContain('FUD0702');
  });

  it('invents nothing over a `return` it cannot read', () => {
    // A build that reported a missing prop over a `return build(ctx)` it never looked inside
    // would be inventing an error. Three shapes, one answer: silence.
    for (const body of [
      'export function layout(ctx, data) { return build(ctx); }',
      'export function layout(ctx, data) { return { ...defaults, theme: "dark" }; }',
      'export function layout(ctx, data) { return { [key]: 1 }; }',
      'export function layout(ctx, data) { return { "culture": "es" }; }',
      'export function layout(ctx, data) { console.log(data); }',
      'export const layout = 1;',
      'export const layout = (ctx, data) => build(ctx);',
    ]) {
      const route = `${LINK}\n@code {\n@server {\n${body}\n}\n}\n<p>hola</p>`;
      expect(routeDiagnostics(route)).toEqual([]);
    }
  });

  it('names the prop and its type, and names only the prop when there is no type', () => {
    const typed = resolveDocument(
      '/app/index.fud',
      memoryIo({ '/app/index.fud': ROUTE, '/app/_layout.fud': LAYOUT }),
    ).value;
    expect(emitRouteModuleMapped(typed).diagnostics[0]?.message).toContain('`culture`: string');

    const untyped = resolveDocument(
      '/app/index.fud',
      memoryIo({
        '/app/index.fud': ROUTE,
        '/app/_layout.fud': layoutSource({ code: 'const { culture } = props<{ culture }>();' }),
      }),
    ).value;
    const message = emitRouteModuleMapped(untyped).diagnostics[0]?.message ?? '';
    expect(message).toContain('`culture`');
    expect(message).not.toContain('`culture`:');
  });

  it('says nothing when the layout requires nothing', () => {
    const graph = resolveDocument(
      '/app/index.fud',
      memoryIo({
        '/app/index.fud': ROUTE,
        '/app/_layout.fud': layoutSource({
          code: 'const { theme = "light" } = props<{ theme?: string }>();',
        }),
      }),
    ).value;
    expect(emitRouteModuleMapped(graph).diagnostics).toEqual([]);
  });
});

describe('§6.2 — `FUD0700`: a layout `@code` declares props and nothing else', () => {
  it('reports a `@server` region over the whole marker, and still emits the layout', () => {
    const region = '@server {\n    export async function load() { return {}; }\n  }';
    const layout = layoutSource({ code: region });
    expect(layoutDiagnostics(layout)).toEqual([{ code: 'FUD0700', span: at(layout, region) }]);
    expect(chain(layout).layout).toContain('export function* layout(');
  });

  it('reports a `@client` region', () => {
    const region = '@client {\n    const n = 1;\n  }';
    const layout = layoutSource({ code: region });
    expect(layoutDiagnostics(layout)).toEqual([{ code: 'FUD0700', span: at(layout, region) }]);
  });

  it('reports a loose statement of the neutral zone', () => {
    const statement = 'const helper = compute();';
    const layout = layoutSource({ code: statement });
    expect(layoutDiagnostics(layout)).toEqual([{ code: 'FUD0700', span: at(layout, statement) }]);
  });

  it('reports a reactive declaration, which the neutral zone does not carry', () => {
    const layout = layoutSource({ code: 'const n = signal(0);' });
    expect(layoutDiagnostics(layout)).toEqual([
      { code: 'FUD0700', span: at(layout, 'n = signal(0)') },
    ]);
  });

  it('says nothing about a `props<T>()` declaration, nor about its type alias', () => {
    const layout = layoutSource({
      code: 'type P = { culture: string };\n  const { culture } = props<P>();',
      html: 'lang="@culture"',
    });
    expect(layoutDiagnostics(layout)).toEqual([]);
    expect(render(chain(layout), { culture: 'eu' })).toContain('<html lang="eu">');
  });
});

describe('§6.4 — `FUD0701`: a layout prop may not be reactive', () => {
  it('reports a prop whose declared type is `Signal<…>`, and hands it over by value', () => {
    const layout = layoutSource({
      code: 'const { culture } = props<{ culture: Signal<string> }>();',
      html: 'lang="@culture"',
    });
    // The span is the property inside the destructuring, not the `@culture` of the markup.
    const start = layout.indexOf('{ culture }') + '{ '.length;
    expect(layoutDiagnostics(layout)).toEqual([
      { code: 'FUD0701', span: { start, end: start + 'culture'.length } },
    ]);
    // The value is ignored as a REFERENCE: it crosses by value like every other one.
    expect(render(chain(layout), { culture: 'ca' })).toContain('<html lang="ca">');
  });

  it('reports a reactive default and drops it', () => {
    const layout = layoutSource({
      code: 'const { theme = signal("light") } = props<{ theme?: string }>();',
      body: 'data-theme="@theme"',
    });
    expect(layoutDiagnostics(layout)).toEqual([
      { code: 'FUD0701', span: at(layout, 'theme = signal("light")') },
    ]);
    const sources = chain(layout);
    expect(sources.layout).not.toContain('signal("light")');
    // Dropped, not emitted: the attribute is omitted when nobody resolves the prop.
    expect(render(sources, {})).toContain('<body>');
  });

  it('keeps a PLAIN default on a prop whose type was the reactive half', () => {
    // Only the channel is dropped here: what made the prop reactive was its type, and its
    // default is an ordinary value the layout still has to fall back to.
    const layout = layoutSource({
      code: 'const { theme = "light" } = props<{ theme: Signal<string> }>();',
      body: 'data-theme="@theme"',
    });
    expect(layoutDiagnostics(layout).map((d) => d.code)).toEqual(['FUD0701']);
    expect(render(chain(layout), {})).toContain('data-theme="light"');
  });

  it('leaves a plain default alone', () => {
    const layout = layoutSource({
      code: 'const { theme = "light" } = props<{ theme?: string }>();',
      body: 'data-theme="@theme"',
    });
    expect(layoutDiagnostics(layout)).toEqual([]);
    expect(render(chain(layout), {})).toContain('data-theme="light"');
  });
});
