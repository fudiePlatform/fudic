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
import { memoryIo, minimalSsr, renderPageHtml } from './_support.js';

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
    // Both on `<html>`: a layout prop is a binding of the shell's head half, never of the
    // `<body>` (BUG-44, `FUD0704`).
    html: 'lang="@culture" data-theme="@theme"',
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
    expect(html).toContain('<html lang="es" data-theme="light">');
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

describe('SDD-48 §4.1 — the body reads its props, in the build (criterion 2)', () => {
  const PROPS = 'const { culture, seccion } = props<{ culture: string; seccion: string }>();';
  const withBody = (inner: string, attrs = ''): string =>
    layoutSource({ code: PROPS, html: 'lang="@culture"', body: attrs }).replace(
      '@RenderBody()</body>',
      `${inner}@RenderBody()</body>`,
    );

  it('renders a read in the body, in an attribute value and on the <body> itself', () => {
    const layout = withBody('<p title="@(culture)">@seccion</p>', 'data-x="@culture"');
    expect(layoutDiagnostics(layout)).toEqual([]);
    const html = render(chain(layout), { culture: 'eu', seccion: 'Blog' });
    expect(html).toContain('data-x="eu"');
    expect(html).toContain('<p title="eu">Blog</p>');
  });

  it('says nothing about `<html>` and the head', () => {
    const layout = layoutSource({ code: PROPS, html: 'lang="@culture"' }).replace(
      '@RenderHead()',
      '<meta property="article:section" content="@seccion">\n  @RenderHead()',
    );
    expect(layoutDiagnostics(layout)).toEqual([]);
  });
});

describe('BUG-44 §3.2 — a prop read in the head reaches the document', () => {
  const layout = layoutSource({
    code: 'const { seccion, culture = "es" } = props<{ seccion: string; culture?: string }>();',
  }).replace(
    '@RenderHead()',
    '<meta charset="utf-8">\n  <meta property="article:section" content="@seccion">\n' +
      '  <link rel="alternate" hreflang="@culture" href="/x">\n  @RenderHead()',
  );

  it('interpolates the attributes of a head element, escaped, and leaves a plain one verbatim', () => {
    const html = render(chain(layout), { seccion: 'Blog & "más"' });
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<meta property="article:section" content="Blog &amp; &quot;más&quot;">');
    expect(html).toContain('<link rel="alternate" hreflang="es" href="/x">');
    expect(html).not.toContain('@seccion');
  });

  it('omits an attribute whose prop is nullish (decision 21)', () => {
    expect(render(chain(layout), {})).toContain('<meta property="article:section">');
  });
});

describe('decision 136 — a `@` in a layout’s `<style>` is `FUD0132`, no longer `FUD0706`', () => {
  it('the layout’s own parse reports each `@` of a `<style>`, the emit adds nothing, and it still emits', () => {
    const layout = layoutSource({ code: 'const { c } = props<{ c: string }>();' })
      .replace('@RenderHead()', '<style>:root { --c: @c; }</style>\n  @RenderHead()')
      .replace('@RenderBody()</body>', '<style>p { color: @c; }</style>@RenderBody()</body>');
    const first = layout.indexOf('@c;');
    const second = layout.indexOf('@c;', first + 1);
    // A layout's syntax errors surface when it is compiled as its own module.
    const own = resolveDocument('/app/_layout.fud', memoryIo({ '/app/_layout.fud': layout }));
    expect(
      own.diagnostics
        .filter((d) => d.code === 'FUD0132' || d.code === 'FUD0706')
        .map((d) => ({ code: d.code, span: { start: d.span.start, end: d.span.end } })),
    ).toEqual([
      { code: 'FUD0132', span: { start: first, end: first + 2 } },
      { code: 'FUD0132', span: { start: second, end: second + 2 } },
    ]);
    expect(layoutDiagnostics(layout)).toEqual([]);
    expect(chain(layout).layout).toContain('export function* layout(');
  });
});

describe('BUG-44 — the head of a route and of a page interpolates its attributes too', () => {
  it('a route’s head contribution reads its `data`', () => {
    const route =
      '<link rel="layout" href="./_layout.fud">\n' +
      '<head><meta name="description" content="@data.summary"><title>@data.title</title></head>\n' +
      '<p>hola</p>';
    const html = render(chain(layoutSource({}), route), undefined, { summary: 'a & "b"', title: 't' });
    expect(html).toContain('<meta name="description" content="a &amp; &quot;b&quot;">');
    expect(html).toContain('<title>t</title>');
  });

  it('a standalone page’s head reads its `data`', async () => {
    const page =
      '<!DOCTYPE html><html><head><meta name="description" content="@data.summary"></head>' +
      '<body><p>x</p></body></html>';
    const graph = resolveDocument('/p.fud', memoryIo({ '/p.fud': page })).value;
    expect(await renderPageHtml(graph, { summary: 'resumen' })).toContain(
      '<meta name="description" content="resumen">',
    );
  });
});

describe('SDD-48 §4.1–§4.2 — what the body may not write, in the build', () => {
  const PROPS = 'const { seccion, items = [] } = props<{ seccion: string; items?: string[] }>();';
  const withBody = (inner: string): string =>
    layoutSource({ code: PROPS }).replace('@RenderBody()</body>', `${inner}@RenderBody()</body>`);

  it('writes every construct and expression without a word (criterion 2)', () => {
    for (const construct of [
      '@if (seccion) {\n  <i>@seccion</i>\n}',
      '@foreach (const s of items) key (s) {\n  <i>@s</i>\n}',
      '@for (let i = 0; i < 2; i++) {\n  <i>x</i>\n}',
      '@while (false) {\n  <i>x</i>\n}',
      '@switch (seccion) {\n  case "a": { <i>x</i> }\n}',
      '<p>@(seccion.length)</p>',
    ]) {
      expect(layoutDiagnostics(withBody(construct)), construct).toEqual([]);
    }
    const html = render(chain(withBody('@if (seccion) {\n  <i>@seccion</i>\n}')), { seccion: 'Blog' });
    // And the construct leaves its anchor behind it, for the route's chunk (§4.3).
    expect(html).toContain('<body> <i>Blog</i> <!--fud:l--><p>hola</p></body>');
  });

  it('reports a `@{ }` over its opening, and still emits', () => {
    const layout = withBody('@{ const a = 1; }');
    expect(layoutDiagnostics(layout)).toEqual([{ code: 'FUD0705', span: at(layout, '@{') }]);
    expect(chain(layout).layout).toContain('export function* layout(');
  });

  it('reports a hole inside a construct over the hole, once (criterion 3)', () => {
    const layout = layoutSource({ code: PROPS }).replace(
      '@RenderBody()</body>',
      '@if (seccion) {\n  @foreach (const s of items) key (s) {\n    <main>@RenderBody()</main>\n  }\n}</body>',
    );
    expect(layoutDiagnostics(layout)).toEqual([{ code: 'FUD0443', span: at(layout, '@RenderBody()') }]);
  });

  it('says nothing about markup, a comment and the two holes', () => {
    const layout = withBody('<nav>menu</nav>\n@* note *@\n@RenderSection(nav)\n');
    expect(layoutDiagnostics(layout)).toEqual([]);
    expect(chain(layout).layout).toContain('export function* layout(');
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
      html: 'data-theme="@theme"',
    });
    expect(layoutDiagnostics(layout)).toEqual([
      { code: 'FUD0701', span: at(layout, 'theme = signal("light")') },
    ]);
    const sources = chain(layout);
    expect(sources.layout).not.toContain('signal("light")');
    // Dropped, not emitted: the attribute is omitted when nobody resolves the prop.
    expect(render(sources, {})).toContain('<html>');
  });

  it('keeps a PLAIN default on a prop whose type was the reactive half', () => {
    // Only the channel is dropped here: what made the prop reactive was its type, and its
    // default is an ordinary value the layout still has to fall back to.
    const layout = layoutSource({
      code: 'const { theme = "light" } = props<{ theme: Signal<string> }>();',
      html: 'data-theme="@theme"',
    });
    expect(layoutDiagnostics(layout).map((d) => d.code)).toEqual(['FUD0701']);
    expect(render(chain(layout), {})).toContain('data-theme="light"');
  });

  it('leaves a plain default alone', () => {
    const layout = layoutSource({
      code: 'const { theme = "light" } = props<{ theme?: string }>();',
      html: 'data-theme="@theme"',
    });
    expect(layoutDiagnostics(layout)).toEqual([]);
    expect(render(chain(layout), {})).toContain('data-theme="light"');
  });
});
