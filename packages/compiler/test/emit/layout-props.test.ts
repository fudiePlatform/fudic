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
} from '../../src/emit/index.js';
import { memoryIo, minimalSsr } from './_support.js';

const ROUTE = '<link rel="layout" href="./_layout.fud"><p>hola</p>';

/** A layout source: its `@code` inside `<head>`, its own `<html>` attributes, its body. */
function layoutSource(parts: { code?: string; html?: string; body?: string }): string {
  const code = parts.code === undefined ? '' : `@code {\n  ${parts.code}\n}\n  `;
  return (
    '<!DOCTYPE html>\n' +
    `<html ${parts.html ?? 'lang="es"'}>\n` +
    `  <head>\n  ${code}@RenderHead()\n  </head>\n` +
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
