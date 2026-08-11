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
    expect(code).toContain('yield* page(data, io(ctx));');
  });

  it('imports page, the ssr streaming io, and load/paths from ?server', () => {
    expect(code).toContain('import { page } from "./customer/[id].fud";');
    expect(code).toContain(
      'import { SsrDom, serializeChunks, htmlToByteStream, escapeText, jsonBlock } from "@fudic/ssr";',
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
