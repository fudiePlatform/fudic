/**
 * SDD-21 §6.15 — layouts through the plugin. A real `vite build` over a project whose route
 * is a fragment (`<link rel="layout">`) and whose shell is a layout living OUTSIDE the
 * routes dir: the route is published, the layout is not a route, the emitted chunk composes
 * the two, and an unreferenced layout under `routesDir` is reported (FUD0434).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build, createServer, type ViteDevServer } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';
import { discoverRoutes } from '../src/discover.js';
import { resolveOptions } from '../src/options.js';
import { transformFud } from '../src/transform.js';
import { nodeIo } from '../src/io.js';
import { FUD_ORPHAN_LAYOUT } from '../src/diagnostics.js';


const LAYOUT = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <link rel="icon" href="/favicon.svg">
    @RenderHead()
  </head>
  <body>
    <header>fudic</header>
    <main>@RenderBody()</main>
    @RenderSection(scripts)
  </body>
</html>
`;

const ROUTE = `<link rel="layout" href="../layouts/_layout.fud">

<head>
  <title>Inicio</title>
</head>

<h1>Inicio</h1>

@section scripts {
  <p class="foot">pie</p>
}
`;

/** A project with `src/routes/index.fud` + `src/layouts/_layout.fud`, plus whatever `extra` adds. */
function project(extra: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-layout-'));
  mkdirSync(join(root, 'src', 'routes'), { recursive: true });
  mkdirSync(join(root, 'src', 'layouts'), { recursive: true });
  writeFileSync(join(root, 'src', 'routes', 'index.fud'), ROUTE);
  writeFileSync(join(root, 'src', 'layouts', '_layout.fud'), LAYOUT);
  for (const [rel, content] of Object.entries(extra)) {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}

describe('discovery (§6.15, SDD-21 §4.7)', () => {
  it('publishes the route fragment and does not publish the layout', () => {
    const root = project();
    const { routes, diagnostics } = discoverRoutes(root, resolveOptions({}).options);
    expect(routes.map((r) => r.route.pattern)).toEqual(['/']);
    expect(routes[0]?.analysis.role).toBe('route');
    expect(diagnostics).toEqual([]);
  });

  it('never treats a layout as a route, even inside routesDir', () => {
    const root = project({ 'src/routes/_layout.fud': LAYOUT });
    const { routes } = discoverRoutes(root, resolveOptions({}).options);
    expect(routes.map((r) => r.route.pattern)).toEqual(['/']);
  });

  it('reports a layout under routesDir that nobody points at (FUD0434)', () => {
    const root = project({ 'src/routes/_layout.fud': LAYOUT });
    const { diagnostics } = discoverRoutes(root, resolveOptions({}).options);
    expect(diagnostics.map((d) => d.code)).toEqual([FUD_ORPHAN_LAYOUT]);
  });

  it('stays silent for the layout the route actually uses', () => {
    const root = project({ 'src/routes/_used.fud': LAYOUT, 'src/routes/r.fud': '<link rel="layout" href="./_used.fud"><p>x</p>' });
    const { diagnostics } = discoverRoutes(root, resolveOptions({}).options);
    expect(diagnostics.map((d) => d.code)).not.toContain(FUD_ORPHAN_LAYOUT);
  });
});

describe('transform (§6.15, SDD-21 §3.4)', () => {
  it('emits the route composed with its layout, with the injected specifier', () => {
    const root = project();
    const out = transformFud(join(root, 'src', 'routes', 'index.fud'), nodeIo());
    expect(out).not.toBeNull();
    // The layout lives outside routesDir: only an injected specifier can reach it.
    expect(out!.code).toContain("import { layout } from '../layouts/_layout.fud';");
    expect(out!.code).toContain('export function* page(data, io) {');
    expect(out!.diagnostics).toEqual([]);
  });

  it('emits the layout module itself, owning the shell', () => {
    const root = project();
    const out = transformFud(join(root, 'src', 'layouts', '_layout.fud'), nodeIo());
    expect(out!.code).toContain('export function* layout(data, io, route) {');
    expect(out!.code).toContain('<!DOCTYPE html>');
    expect(out!.code).toContain('route.body($dom, ');
  });

  it('surfaces a broken chain as a graph diagnostic instead of emitting silence', () => {
    const root = project({ 'src/routes/bad.fud': '<link rel="layout" href="./nope.fud"><p>x</p>', 'src/routes/nope.fud': '<app-x><template shadowrootmode="open"><p>x</p></template></app-x>' });
    const out = transformFud(join(root, 'src', 'routes', 'bad.fud'), nodeIo());
    expect(out!.diagnostics.map((d) => d.code)).toContain('FUD0435');
  });
});

describe('vite build (§6.15)', () => {
  let output: { fileName: string; code?: string; source?: string }[];

  beforeAll(async () => {
    const root = project();
    const result = (await build({
      root,
      logLevel: 'silent',
      resolve: { alias: { ...runtimeAlias } },
      plugins: [fudic()],
      build: { write: false, minify: false },
    })) as unknown as { output: { fileName: string; code?: string; source?: string }[] };
    output = result.output;
  }, 120_000);

  it('prerenders the composed document to HTML', () => {
    const html = output.find((f) => f.fileName === 'index.html');
    expect(html).toBeDefined();
    const text = String(html!.source);
    // The shell comes from the layout, the title and the body from the route, and the
    // section from the route rendered at the layout's own @RenderSection point.
    expect(text).toContain('<!DOCTYPE html>');
    expect(text).toContain('<title>Inicio</title>');
    expect(text).toContain('<link rel="icon" href="/favicon.svg">');
    expect(text.indexOf('<header>fudic</header>')).toBeLessThan(text.indexOf('<h1>Inicio</h1>'));
    expect(text.indexOf('<h1>Inicio</h1>')).toBeLessThan(text.indexOf('class="foot"'));
  });

  it('publishes the route in the manifest and the layout nowhere', () => {
    const manifest = output.find((f) => f.fileName.endsWith('fudic-routes.json'));
    const text = String(manifest!.source);
    expect(text).toContain('"pattern":"/"');
    expect(text).not.toContain('_layout');
  });
});

describe('vite dev (§6.15)', () => {
  let server: ViteDevServer;
  let origin: string;
  let root: string;

  beforeAll(async () => {
    root = project();
    writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: [] }));
    server = await createServer({
      root,
      logLevel: 'silent',
      resolve: { alias: { ...runtimeAlias } },
      plugins: [fudic()],
      server: { port: 0 },
    });
    await server.listen();
    const address = server.httpServer!.address() as { port: number };
    origin = `http://localhost:${address.port}`;
  }, 120_000);

  afterAll(async () => {
    await server.close();
  });

  /** The dev middleware only owns navigations, so ask for HTML like a browser does. */
  const navigate = (path: string): Promise<Response> =>
    fetch(`${origin}${path}`, { headers: { accept: 'text/html' } });

  it('serves the composed document on demand', async () => {
    const html = await (await navigate('/')).text();
    expect(html).toContain('<header>fudic</header>');
    expect(html).toContain('<h1>Inicio</h1>');
    expect(html).toContain('class="foot"');
  });

  it('knows the layout is a dependency of the route, so editing it invalidates the route', async () => {
    // Nothing to implement for this: the route module IMPORTS the layout module, so the
    // edge is a real ESM edge in Vite's own graph — the same mechanism that already
    // invalidates a page when one of its components changes.
    await navigate('/');
    const id = (...parts: string[]): string => join(root, ...parts).replace(/\\/gu, '/');
    const routeModule = server.moduleGraph.getModuleById(id('src', 'routes', 'index.fud'));
    expect(routeModule).toBeDefined();
    const deps = [...(routeModule?.ssrImportedModules ?? [])].map((m) => m.id?.replace(/\\/gu, '/'));
    expect(deps).toContain(id('src', 'layouts', '_layout.fud'));
  });
});
