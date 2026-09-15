/**
 * SDD-20 §3.4: the generated route chunk. `render(ctx) => ReadableStream`, in two
 * variants — the edge one resolves data in process, the linked one never sees `load`.
 */

import { describe, it, expect } from 'vitest';
import { emitRenderChunk } from '../src/wrapper.js';

describe('emitRenderChunk — the edge variant', () => {
  const code = emitRenderChunk({
    pageModule: './customer/[id].fud',
    hasLoad: true,
    hasPaths: true,
    withLoad: true,
  });

  it('exports render(ctx) and streams the page a trozos', () => {
    expect(code).toContain('export function render(ctx) {');
    expect(code).toContain('return htmlToByteStream(');
    expect(code).toContain('async function* ()');
    expect(code).toContain('yield* page(data, io(ctx), undefined, layout);');
  });

  it('imports page, the ssr streaming io, and load/paths from ?server', () => {
    expect(code).toContain('import { page } from "./customer/[id].fud";');
    expect(code).toContain(
      'import { SsrDom, serializeChunks, htmlToByteStream, escapeText, escapeAttr, jsonBlock } from "@fudic/ssr";',
    );
    expect(code).toContain('import { load } from "./customer/[id].fud?server";');
    expect(code).toContain('export { paths } from "./customer/[id].fud?server";');
  });

  it('passes the response nonce through io, for the inline style polyfill', () => {
    expect(code).toContain('nonce: ctx.nonce');
  });

  it('exports data(ctx) so the generated endpoint reuses the same load', () => {
    expect(code).toContain('export async function data(ctx) {');
    expect(code).toContain('return load(ctx);');
  });

  it('prefers data already resolved by the caller', () => {
    expect(code).toContain('const data = ctx.data !== undefined ? ctx.data : await load(ctx);');
  });
});

describe('emitRenderChunk — the linked (Service Worker) variant', () => {
  const code = emitRenderChunk({
    pageModule: './customer/[id].fud',
    hasLoad: true,
    hasPaths: true,
    withLoad: false,
  });

  it('never imports load or paths: server code does not ship to the client', () => {
    expect(code).not.toContain('?server');
    expect(code).not.toContain('load');
    expect(code).not.toContain('paths');
  });

  it('takes its data from ctx, which the SW filled from the data endpoint', () => {
    expect(code).toContain('const data = ctx.data !== undefined ? ctx.data : {};');
  });
});

describe('emitRenderChunk — a page without load', () => {
  it('renders with empty data in both variants', () => {
    for (const withLoad of [true, false]) {
      const code = emitRenderChunk({ pageModule: './index.fud', hasLoad: false, withLoad });
      expect(code).not.toContain('?server');
      expect(code).toContain('const data = ctx.data !== undefined ? ctx.data : {};');
    }
  });
});

/**
 * SDD-40 §6.8–§6.9 — the third `@server` export, and what runs when.
 *
 * `layout(ctx, data)` goes AFTER `load` and receives what it resolved, which is what lets a
 * prop come out of the row `load` just fetched as readily as out of the URL. And `paths()`
 * is still nobody's but the build's.
 */
describe('emitRenderChunk — the layout resolver (SDD-40)', () => {
  const edge = emitRenderChunk({
    pageModule: './blog/[slug].fud',
    hasLoad: true,
    hasPaths: true,
    hasLayout: true,
    withLoad: true,
  });

  it('imports it under another name: `layout` is what the page module calls its own', () => {
    expect(edge).toContain('import { layout as layoutProps } from "./blog/[slug].fud?server";');
  });

  it('resolves it AFTER load, with what load returned (§6.8)', () => {
    const data = edge.indexOf('const data = ctx.data !== undefined');
    const layout = edge.indexOf('const layout = ctx.layout !== undefined');
    expect(data).toBeGreaterThan(-1);
    expect(layout).toBeGreaterThan(data);
    expect(edge).toContain('await layoutProps(ctx, data);');
  });

  it('hands what it resolved to the page, behind the container', () => {
    expect(edge).toContain('yield* page(data, io(ctx), undefined, layout);');
  });

  it('never CALLS paths(): it is re-exported for the build and nothing else (§6.9)', () => {
    expect(edge).toContain('export { paths } from');
    expect(edge).not.toContain('paths(');
  });

  it('the linked variant imports neither, and takes both from ctx (§4.5)', () => {
    const linked = emitRenderChunk({
      pageModule: './blog/[slug].fud',
      hasLoad: true,
      hasPaths: true,
      hasLayout: true,
      withLoad: false,
    });
    expect(linked).not.toContain('?server');
    expect(linked).not.toContain('layoutProps');
    expect(linked).toContain('const layout = ctx.layout;');
  });

  it('resolves it inside the SAME container `load` used, when the route injects', () => {
    // One container per request: what `load` injects and what the resolver injects have to
    // be the same instances, or a root service would be built twice for one response.
    const withDi = emitRenderChunk({
      pageModule: './blog/[slug].fud',
      hasLoad: true,
      hasLayout: true,
      hasDi: true,
      withLoad: true,
    });
    expect(withDi).toContain('await load(withDi(ctx, $root))');
    expect(withDi).toContain('await layoutProps(withDi(ctx, $root), data);');
    expect(withDi).toContain('yield* page(data, io(ctx), $root, layout);');
  });

  it('a route that resolves nothing still hands the layout what the caller passed', () => {
    const none = emitRenderChunk({ pageModule: './index.fud', hasLoad: false, withLoad: true });
    expect(none).not.toContain('layoutProps');
    expect(none).toContain('const layout = ctx.layout;');
  });
});
