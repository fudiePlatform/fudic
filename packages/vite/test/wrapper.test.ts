/**
 * SDD-20 §3.4: the generated route chunk. `render(ctx) => ReadableStream`, in two
 * variants — the edge one resolves data in process, the linked one never sees `load`.
 * Since SDD-60 §4.4, `load`, `paths` and `layout` are the pieces of the route's `.fudapi`.
 */

import { describe, it, expect } from 'vitest';
import { emitRenderChunk, routeApi } from '../src/wrapper.js';
import type { PageAnalysis } from '../src/analyze.js';
import { NO_STRATEGY } from '../src/strategy.js';

/** The route's `.fudapi`, `routes/customer/[id]`, with what it declares. */
const api = (over: { load?: boolean; paths?: boolean; layout?: boolean } = {}) => ({
  id: 'routes/customer/[id]',
  load: false,
  paths: false,
  layout: false,
  root: 'fudic:$root/server',
  dev: false,
  ...over,
});

describe('emitRenderChunk — the edge variant', () => {
  const code = emitRenderChunk({
    pageModule: './customer/[id].fud',
    withLoad: true,
    api: api({ load: true, paths: true }),
  });

  it('exports render(ctx) and streams the page a trozos', () => {
    expect(code).toContain('export function render(ctx) {');
    expect(code).toContain('return htmlToByteStream(');
    expect(code).toContain('async function* ()');
    expect(code).toContain('yield* page(data, io(ctx), undefined, layout);');
  });

  it('imports page, the ssr streaming io, and load/paths from fudic:<id>', () => {
    expect(code).toContain('import { page } from "./customer/[id].fud";');
    expect(code).toContain(
      'import { SsrDom, serializeChunks, htmlToByteStream, escapeText, escapeAttr, guardUrl, jsonBlock, packData, PageParts, iocRoot } from "@fudic/ssr";',
    );
    // `load` receives a `ServerContext` always, chain or not (SDD-56 §4.16).
    expect(code).toContain('import { markPrivate, pageContext, withRequest } from "@fudic/http/server";');
    expect(code).toContain('import { ready as $ready } from "fudic:$root/server";');
    expect(code).toContain('import { load as $load, paths as $paths } from "fudic:routes/customer/[id]";');
    expect(code).toContain('import { implementation as $impl, runLoad as $runLoad } from "@fudic/http/contract/server";');
  });

  it('passes the response nonce through io, for the inline style polyfill', () => {
    expect(code).toContain('nonce: ctx.nonce');
  });

  it('exports data(ctx) so the generated endpoint reuses the same load', () => {
    expect(code).toContain('export async function data(ctx) {');
    expect(code).toContain('const data = await $ready.then(() => $runLoad($load, $ctx, false));');
    // One response, two halves (SDD-40 §3.3) — `layout` absent when the route resolves none.
    expect(code).toContain('return { data };');
    // What read the session goes out private, also when it threw (SDD-69 §3.2).
    expect(code).toContain('}).finally(() => markPrivate($ctx.response));');
  });

  it('marks the response once load and layout are done, in render too (SDD-69 §3.2)', () => {
    expect(code).toContain('const [data, layout] = await (async () => {');
    expect(code).toContain('})().finally(() => markPrivate($ctx.response));');
  });

  it('prefers data already resolved by the caller', () => {
    expect(code).toContain(
      'const data = ctx.data !== undefined ? ctx.data : await withRequest($root, () => $ready.then(() => $runLoad($load, $ctx, false)));',
    );
  });

  it('in dev, a `load` nobody implemented says so', () => {
    const dev = emitRenderChunk({ pageModule: './x.fud', withLoad: true, api: { ...api({ load: true }), dev: true } });
    expect(dev).toContain('$runLoad($load, $ctx, true)');
  });
});

describe('emitRenderChunk — the linked (Service Worker) variant', () => {
  const code = emitRenderChunk({
    pageModule: './customer/[id].fud',
    withLoad: false,
    api: api({ load: true, paths: true, layout: true }),
  });

  it('never imports load or paths: server code does not ship to the client', () => {
    expect(code).not.toContain('fudic:');
    expect(code).not.toContain('$load');
    expect(code).not.toContain('paths');
  });

  it('takes its data from ctx, which the SW filled from the data endpoint', () => {
    expect(code).toContain('const data = ctx.data !== undefined ? ctx.data : {};');
  });
});

describe('emitRenderChunk — a page without load', () => {
  it('renders with empty data in both variants, with a .fudapi or without one', () => {
    for (const withLoad of [true, false]) {
      for (const over of [{}, { api: api() }]) {
        const code = emitRenderChunk({ pageModule: './index.fud', withLoad, ...over });
        expect(code).not.toContain('fudic:');
        expect(code).not.toContain('export async function data');
        expect(code).toContain('const data = ctx.data !== undefined ? ctx.data : {};');
      }
    }
  });
});

/**
 * SDD-40 §6.8–§6.9 — the layout resolver, and what runs when.
 *
 * `layout(ctx, data)` goes AFTER `load` and receives what it resolved, which is what lets a
 * prop come out of the row `load` just fetched as readily as out of the URL. And `paths()`
 * is still nobody's but the build's.
 */
describe('emitRenderChunk — the layout resolver (SDD-40)', () => {
  const edge = emitRenderChunk({
    pageModule: './blog/[slug].fud',
    withLoad: true,
    api: api({ load: true, paths: true, layout: true }),
  });

  it('imports it under another name: `layout` is what the page module calls its own', () => {
    expect(edge).toContain('layout as $layout');
    expect(edge).toContain('async function layoutProps(ctx, data) {\n  await $ready;\n  return $impl($layout)(ctx, data);\n}');
  });

  it('resolves it AFTER load, with what load returned (§6.8)', () => {
    const data = edge.indexOf('const data = ctx.data !== undefined');
    const layout = edge.indexOf('const layout = ctx.layout !== undefined');
    expect(data).toBeGreaterThan(-1);
    expect(layout).toBeGreaterThan(data);
    expect(edge).toContain('await withRequest($root, () => layoutProps($ctx, data));');
  });

  it('hands what it resolved to the page, behind the container', () => {
    expect(edge).toContain('yield* page(data, io(ctx), undefined, layout);');
  });

  it('the endpoint answers with the two halves in ONE response (§6.10)', () => {
    expect(edge).toContain('const data = await $ready.then(() => $runLoad($load, $ctx, false));');
    expect(edge).toContain('return { data, layout: await layoutProps($ctx, data) };');
  });

  it('a route with a resolver and no `load` still gets an endpoint', () => {
    // The Service Worker executes neither, so without one it would have no way to be handed
    // the props at all.
    const noLoad = emitRenderChunk({ pageModule: './about.fud', withLoad: true, api: api({ layout: true }) });
    expect(noLoad).toContain('export async function data(ctx) {');
    expect(noLoad).toContain('const data = {};');
    expect(noLoad).toContain('return { data, layout: await layoutProps($ctx, data) };');
  });

  it('never CALLS paths(): it is re-exported for the build and nothing else (§6.9)', () => {
    expect(edge).toContain('export async function paths() {\n  await $ready;\n  return $impl($paths)();\n}');
    expect(edge.match(/paths\(/gu)).toHaveLength(1);
  });

  it('the linked variant imports neither, and takes both from ctx (§4.5)', () => {
    const linked = emitRenderChunk({ pageModule: './blog/[slug].fud', withLoad: false, api: api({ load: true, paths: true, layout: true }) });
    expect(linked).not.toContain('fudic:');
    expect(linked).not.toContain('layoutProps');
    expect(linked).toContain('const layout = ctx.layout;');
  });

  it('hands the resolver the bare ctx even when the route injects: `load` is who injects', () => {
    // BUG-44: a service the layout's props need is injected in `load` and reaches the resolver
    // in `data`. The container rides `load`'s ctx and the page's render, never the resolver's.
    const withDi = emitRenderChunk({
      pageModule: './blog/[slug].fud',
      hasDi: true,
      withLoad: true,
      api: api({ load: true, layout: true }),
    });
    // `$ctx` is the server context of the request (SDD-56 §4.6), for both: `load` injects on
    // its own, inside the request, and the container rides no ctx at all.
    expect(withDi).toContain('$runLoad($load, $ctx, false)');
    expect(withDi).toContain('withRequest($root, () => layoutProps($ctx, data))');
    expect(withDi).not.toContain('withDi');
    expect(withDi).toContain('yield* page(data, io(ctx), $root, layout);');
  });

  it('a route that resolves nothing still hands the layout what the caller passed', () => {
    const none = emitRenderChunk({ pageModule: './index.fud', withLoad: true });
    expect(none).not.toContain('layoutProps');
    expect(none).toContain('const layout = ctx.layout;');
  });
});

describe('emitRenderChunk — a route of a .fudapi (SDD-60 §4.4)', () => {
  const of = (locale?: string): string =>
    emitRenderChunk({
      pageModule: './blog/[slug].fud',
      withLoad: true,
      api: { ...api({ load: true, paths: true }), id: 'routes/blog/[slug]', ...(locale !== undefined ? { locale } : {}) },
    });

  it('reads its pieces from fudic:<id> once the root is ready', () => {
    expect(of()).toContain('import { ready as $ready } from "fudic:$root/server";');
    expect(of()).toContain('import { load as $load, paths as $paths } from "fudic:routes/blog/[slug]";');
  });

  it('in an app with languages, from the root and the contract of its locale', () => {
    expect(of('en')).toContain('import { ready as $ready } from "fudic:$root/server?locale=en";');
    expect(of('en')).toContain('from "fudic:routes/blog/[slug]?locale=en";');
  });
});

describe('routeApi', () => {
  const analysis = (over: Partial<PageAnalysis> = {}): PageAnalysis => ({
    role: 'route',
    isPage: true,
    hasLoad: true,
    hasPaths: false,
    hasLayout: true,
    strategy: NO_STRATEGY,
    diagnostics: [],
    ...over,
  });

  it('what discovery read of the linked .fudapi, with the root and whether it is dev', () => {
    expect(routeApi({ analysis: analysis({ api: 'routes/r' }) }, 'fudic:root', true)).toEqual({
      api: { id: 'routes/r', load: true, paths: false, layout: true, root: 'fudic:root', dev: true },
    });
    expect(routeApi({ analysis: analysis({ api: 'routes/r' }), locale: 'en' }, 'fudic:root', false).api?.locale).toBe('en');
  });

  it('nothing for a route that links no .fudapi', () => {
    expect(routeApi({ analysis: analysis() }, 'fudic:root', false)).toEqual({});
  });
});
