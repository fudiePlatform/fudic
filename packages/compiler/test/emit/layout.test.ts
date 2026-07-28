/**
 * SDD-21 §6.9–§6.14 — the layout chain and the composed emit.
 *
 * The centrepiece is §6.10: a route + its layout must produce the SAME document as the
 * equivalent monolithic page. The two emitted modules are EXECUTED against the minimal SSR
 * fake of `_support`, with the same component stand-ins on both sides, and their output
 * compared — the head byte for byte, the whole document modulo the indentation whitespace
 * that two different source files cannot share by construction.
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveComponents,
  resolveDocument,
  emitLayoutModule,
  emitLayoutModuleMapped,
  emitRouteModule,
  emitRouteModuleMapped,
  emitPageModule,
  type DocumentGraph,
} from '../../src/emit/index.js';
import { layoutFixturesDir, fixtureIo, memoryIo, minimalSsr } from './_support.js';

const fixturePath = (name: string): string => join(layoutFixturesDir, name);

// --- module execution -------------------------------------------------------------

/**
 * Evaluate an emitted module: strip its `import` lines and inject the bindings they would
 * have provided. Enough to RUN the composition — the point of §6.10 is what the modules
 * produce, not that a bundler could link them.
 */
function evalModule(code: string, bindings: Record<string, unknown>, returns: string): unknown {
  const body = code.replace(/^import[^\n]*\n/gmu, '').replace(/^export\s+/gmu, '') + `\nreturn ${returns};`;
  const names = Object.keys(bindings);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(...names, body)(...Object.values(bindings)) as unknown;
}

/** A component stand-in: renders its tag name into the shadow root. Same on both sides. */
function componentBindings(tags: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const tag of tags) {
    const name = 'render' + tag.split('-').map((s) => s[0]!.toUpperCase() + s.slice(1)).join('');
    out[name] = (
      $dom: Record<string, (...a: unknown[]) => unknown>,
      $shadow: unknown,
    ): void => {
      const append = $dom['append']!;
      const text = $dom['text']!;
      append($shadow, text(`[${tag}]`));
    };
    out[`${name}Tag`] = tag;
    out[`${name}Css`] = `.${tag} { color: red; }`;
  }
  return out;
}

type PageFn = (data: unknown, io: unknown) => Iterable<string>;

const DATA = {
  title: 'Blog',
  posts: [
    { id: '1', title: 'Uno', summary: 'Primero' },
    { id: '2', title: 'Dos', summary: 'Segundo' },
  ],
};

/** Run a `page(data, io)` generator to completion. */
function render(page: PageFn): string {
  return [...page(DATA, minimalSsr())].join('');
}

const TAGS = ['app-badge', 'app-card', 'app-button'];

/** Emit route + layout from the fixtures, link them in memory and run the result. */
function renderComposed(): string {
  const graph = resolveDocument(fixturePath('blog.fud'), fixtureIo).value;
  const layout = evalModule(
    emitLayoutModule(graph, graph.layouts[0]!),
    componentBindings(TAGS),
    'layout',
  );
  const page = evalModule(
    emitRouteModule(graph),
    { ...componentBindings(TAGS), layout },
    'page',
  ) as PageFn;
  return render(page);
}

const headOf = (html: string): string => html.slice(html.indexOf('<head>'), html.indexOf('</head>') + 7);
const normalize = (html: string): string => html.replace(/>\s+</gu, '><').replace(/\s+/gu, ' ').trim();

// --- the graph --------------------------------------------------------------------

describe('resolveDocument — the layout chain (§6.9, decision 87)', () => {
  it('resolves the entry, its layout and the union of their components', () => {
    const { value: graph, diagnostics } = resolveDocument(fixturePath('blog.fud'), fixtureIo);
    expect(diagnostics).toEqual([]);
    expect(graph.layouts.map((l) => l.doc.type)).toEqual(['layout-document']);
    // Outermost layout first, entry last (decision 88): app-badge comes from the layout,
    // app-card from the route, app-button from app-card's own links.
    expect([...graph.components.keys()]).toEqual(['app-badge', 'app-card', 'app-button']);
  });

  it('walks a two-level chain innermost first', () => {
    const files = {
      '/r.fud': '<link rel="layout" href="./inner.fud"><p>route</p>',
      '/inner.fud':
        '<!DOCTYPE html><html><head><link rel="layout" href="./outer.fud">@RenderHead()</head><body>@RenderBody()</body></html>',
      '/outer.fud':
        '<!DOCTYPE html><html><head>@RenderHead()</head><body>@RenderBody()</body></html>',
    };
    const { value: graph, diagnostics } = resolveDocument('/r.fud', memoryIo(files));
    expect(diagnostics).toEqual([]);
    expect(graph.layouts.map((l) => l.path)).toEqual(['/inner.fud', '/outer.fud']);
  });

  it('cuts a cycle with FUD0422 instead of recursing forever', () => {
    const shell = (href: string): string =>
      `<!DOCTYPE html><html><head><link rel="layout" href="${href}">@RenderHead()</head><body>@RenderBody()</body></html>`;
    const files = {
      '/r.fud': '<link rel="layout" href="./a.fud"><p>x</p>',
      '/a.fud': shell('./b.fud'),
      '/b.fud': shell('./a.fud'),
    };
    const { value: graph, diagnostics } = resolveDocument('/r.fud', memoryIo(files));
    expect(diagnostics.map((d) => d.code)).toContain('FUD0422');
    expect(graph.layouts).toHaveLength(2);
  });

  it('reports a link to a component with FUD0435 and to a page with FUD0423', () => {
    const notLayout = resolveDocument(
      '/r.fud',
      memoryIo({
        '/r.fud': '<link rel="layout" href="./c.fud"><p>x</p>',
        '/c.fud': '<app-c><template shadowrootmode="open"><p>c</p></template></app-c>',
      }),
    );
    expect(notLayout.diagnostics.map((d) => d.code)).toContain('FUD0435');

    const noRenderBody = resolveDocument(
      '/r.fud',
      memoryIo({
        '/r.fud': '<link rel="layout" href="./p.fud"><p>x</p>',
        '/p.fud': '<!DOCTYPE html><html><head></head><body><p>p</p></body></html>',
      }),
    );
    expect(noRenderBody.diagnostics.map((d) => d.code)).toContain('FUD0423');
  });

  it('warns FUD0429 for a section no layout renders (§6.8)', () => {
    const files = {
      '/r.fud': '<link rel="layout" href="./l.fud"><p>x</p>@section ghost { <p>g</p> }',
      '/l.fud':
        '<!DOCTYPE html><html><head>@RenderHead()</head><body>@RenderBody()</body></html>',
    };
    const { diagnostics } = resolveDocument('/r.fud', memoryIo(files));
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0429']);
    expect(diagnostics[0]!.severity).toBe('warning');
  });

  it('stays silent for a rendered section the route does not declare (§6.8)', () => {
    const files = {
      '/r.fud': '<link rel="layout" href="./l.fud"><p>x</p>',
      '/l.fud':
        '<!DOCTYPE html><html><head>@RenderHead()</head><body>@RenderBody()@RenderSection(none)</body></html>',
    };
    expect(resolveDocument('/r.fud', memoryIo(files)).diagnostics).toEqual([]);
  });
});

// --- the emitted modules ----------------------------------------------------------

describe('emitted module shape (§6.12, SDD-21 §3.5)', () => {
  const graph: DocumentGraph = resolveDocument(fixturePath('blog.fud'), fixtureIo).value;

  it('gives the layout a `layout(data, io, route)` generator that owns the shell', () => {
    const code = emitLayoutModule(graph, graph.layouts[0]!);
    expect(code).toContain('export function* layout(data, io, route) {');
    expect(code).toContain('<!DOCTYPE html>');
    expect(code).toContain('route.head();');
    expect(code).toContain('route.body($dom, ');
    expect(code).toContain("route.section(\"scripts\", $dom, ");
    expect(code).toContain('yield* serialize($body);');
  });

  it('keeps the route module on the SAME public shape as a page (§6.12)', () => {
    const code = emitRouteModule(graph);
    expect(code).toContain('export function* page(data, io) {');
    expect(code).toContain("import { layout } from './_layout.mjs';");
    expect(code).toContain('yield* layout(data, io, {');
    // Its slots: head as a string, body/section as tree builders.
    expect(code).toContain('head() {');
    expect(code).toContain('body($dom, $parent) {');
    expect(code).toContain('section(name, $dom, $parent) {');
    expect(code).toContain('if (name === "scripts") {');
    // The shell belongs to the layout: a route module never writes a doctype.
    expect(code).not.toContain('<!DOCTYPE html>');
  });

  it('accepts an injected layout specifier, like components (§3.4)', () => {
    const code = emitRouteModule(graph, {
      importExt: '.fud',
      layoutSpecifier: (l) => `../layouts/${l.path.split(/[\\/]/u).pop()}`,
    });
    expect(code).toContain("import { layout } from '../layouts/_layout.fud';");
  });

  it('emits a nested layout as a delegation to its parent (decision 87)', () => {
    const files = {
      '/r.fud': '<link rel="layout" href="./inner.fud"><p>route</p>',
      '/inner.fud':
        '<!DOCTYPE html><html><head><link rel="layout" href="./outer.fud">@RenderHead()</head><body><nav>n</nav>@RenderBody()</body></html>',
      '/outer.fud':
        '<!DOCTYPE html><html><head>@RenderHead()</head><body>@RenderBody()</body></html>',
    };
    const nested = resolveDocument('/r.fud', memoryIo(files)).value;
    const code = emitLayoutModule(nested, nested.layouts[0]!);
    expect(code).toContain("import { layout as parentLayout } from './outer.mjs';");
    expect(code).toContain('yield* parentLayout(data, io, {');
    expect(code).not.toContain('<!DOCTYPE html>');
    // The outer one still owns the shell.
    expect(emitLayoutModule(nested, nested.layouts[1]!)).toContain('<!DOCTYPE html>');
  });

  it('falls back to the author specifier when the parent layout did not resolve', () => {
    // The broken href is already FUD0435/FUD0423; the module must still say what it meant
    // to import instead of emitting a dangling `undefined`.
    const files = {
      '/r.fud': '<link rel="layout" href="./inner.fud"><p>x</p>',
      '/inner.fud':
        '<!DOCTYPE html><html><head><link rel="layout" href="./missing.fud">@RenderHead()</head><body>@RenderBody()</body></html>',
      '/missing.fud': '<app-x><template shadowrootmode="open"><p>x</p></template></app-x>',
    };
    const broken = resolveDocument('/r.fud', memoryIo(files));
    expect(broken.diagnostics.map((d) => d.code)).toContain('FUD0435');
    expect(emitLayoutModule(broken.value, broken.value.layouts[0]!)).toContain(
      "import { layout as parentLayout } from './missing.fud';",
    );
  });

  it('skips a nameless @section instead of emitting a broken arm', () => {
    const files = {
      '/r.fud': '<link rel="layout" href="./l.fud"><p>x</p>@section { <p>ghost</p> }',
      '/l.fud':
        '<!DOCTYPE html><html><head>@RenderHead()</head><body>@RenderBody()</body></html>',
    };
    const code = emitRouteModule(resolveDocument('/r.fud', memoryIo(files)).value);
    expect(code).toContain('section(name, $dom, $parent) {');
    expect(code).not.toContain('name === ""');
  });

  it('maps every anchor into its OWN `.fud`, never the other one (§6.14)', () => {
    const layout = graph.layouts[0]!;
    const layoutOut = emitLayoutModuleMapped(graph, layout);
    const routeOut = emitRouteModuleMapped(graph);
    // The route interpolates (`@data.title`, the `@foreach` header) so it anchors; this
    // layout is static markup, and static markup has nothing to anchor — zero is correct.
    expect(routeOut.mappings.length).toBeGreaterThan(0);
    expect(layoutOut.missingAssets).toEqual([]);
    // A single `sources` entry per module is only correct if every anchor falls inside it.
    for (const m of layoutOut.mappings) {
      expect(m.sourceOffset).toBeLessThan(layout.source.length);
    }
    for (const m of routeOut.mappings) {
      expect(m.sourceOffset).toBeLessThan(graph.entrySource.length);
    }
    // The route's markup anchors resolve to the route source (`data.posts` is only there).
    const anchored = routeOut.mappings.map((m) => graph.entrySource.slice(m.sourceOffset, m.sourceOffset + 10));
    expect(anchored.some((s) => s.startsWith('const post'))).toBe(true);
  });

  it('anchors every module to a single source file (§6.14)', () => {
    // One module, one `.fud`: the composition never merges text across files, which is
    // what keeps `SourceMapBuilder`'s single `sources` entry correct.
    const layoutCode = emitLayoutModule(graph, graph.layouts[0]!);
    const routeCode = emitRouteModule(graph);
    expect(layoutCode).toContain('fudic 2026'); // the layout's own markup
    expect(layoutCode).not.toContain('data.posts'); // …and nothing of the route's
    expect(routeCode).toContain('data.posts');
    expect(routeCode).not.toContain('fudic 2026');
  });
});

// --- equivalence ------------------------------------------------------------------

describe('composed output equals the monolithic page (§6.10, §6.11)', () => {
  const monolithicGraph = resolveComponents(fixturePath('blog-monolithic.fud'), fixtureIo);
  const monolithic = render(
    evalModule(emitPageModule(monolithicGraph), componentBindings(TAGS), 'page') as PageFn,
  );

  it('produces the same <head>, byte for byte (§6.11)', () => {
    expect(headOf(renderComposed())).toBe(headOf(monolithic));
  });

  it('produces the same document (§6.10)', () => {
    expect(normalize(renderComposed())).toBe(normalize(monolithic));
  });

  it('renders the route title, not a layout default, and only once (§6.11)', () => {
    const html = renderComposed();
    expect(html.match(/<title>/gu)).toHaveLength(1);
    expect(html).toContain('<title>Blog</title>');
  });

  it('emits the style polyfill once and the union of both graphs (§6.11)', () => {
    const html = renderComposed();
    expect(html.match(/<script>/gu)).toHaveLength(1);
    // app-badge comes from the layout, app-card + app-button from the route.
    for (const tag of TAGS) {
      expect(html.match(new RegExp(`<style type="module" specifier="${tag}">`, 'gu'))).toHaveLength(1);
    }
  });

  it('splices the route body inside the layout markup (§6.10)', () => {
    const html = renderComposed();
    const header = html.indexOf('[app-badge]');
    const body = html.indexOf('<h1>');
    const footer = html.indexOf('fudic 2026');
    const section = html.indexOf('class="analytics"');
    expect(header).toBeLessThan(body);
    expect(body).toBeLessThan(footer);
    expect(footer).toBeLessThan(section);
  });

  it('yields the whole <head> in the FIRST chunk, before the body (§6.12)', () => {
    const graph = resolveDocument(fixturePath('blog.fud'), fixtureIo).value;
    const layout = evalModule(emitLayoutModule(graph, graph.layouts[0]!), componentBindings(TAGS), 'layout');
    const page = evalModule(emitRouteModule(graph), { ...componentBindings(TAGS), layout }, 'page') as PageFn;
    const first = page(DATA, minimalSsr())[Symbol.iterator]().next().value as string;
    expect(first).toContain('<head>');
    expect(first).toContain('</head>');
    expect(first).not.toContain('<h1>');
  });
});
