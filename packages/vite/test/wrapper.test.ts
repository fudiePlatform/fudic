/**
 * SDD-19 §6.8/§6.8b: the generated `RenderChunk` wrapper. `default (route) =>
 * ReadableStream` shape, params extracted inside the chunk from the baked pattern,
 * `load` fed the params, and the streaming (generator) form.
 */

import { describe, it, expect } from 'vitest';
import { emitRenderChunk } from '../src/wrapper.js';

describe('emitRenderChunk — shape (crit. #8)', () => {
  const code = emitRenderChunk({
    pageModule: './customer/[id].fud',
    pattern: '/customer/:id',
    hasLoad: true,
  });

  it('exports a default (route) => stream', () => {
    expect(code).toContain('export default function (route) {');
    expect(code).toContain('return htmlToByteStream(');
  });

  it('imports page, the ssr streaming io, and load from ?server', () => {
    expect(code).toContain('import { page } from "./customer/[id].fud";');
    expect(code).toContain(
      'import { SsrDom, serializeChunks, htmlToByteStream, escapeText } from "@fudic/ssr";',
    );
    expect(code).toContain('import { load } from "./customer/[id].fud?server";');
  });

  it('bakes the pattern segments and extracts params inside the chunk', () => {
    expect(code).toContain('const SEGMENTS = ["customer",":id"];');
    expect(code).toContain('function extractParams(route)');
    expect(code).toContain('await load({ params: extractParams(route) })');
  });

  it('streams a trozos: page is consumed as a generator (yield*)', () => {
    expect(code).toContain('async function* ()');
    expect(code).toContain('yield* page(data, io);');
    expect(code).toContain('serialize: serializeChunks');
  });
});

describe('emitRenderChunk — variants', () => {
  it('a static route with load feeds empty params, no extractor', () => {
    const code = emitRenderChunk({ pageModule: './about.fud', pattern: '/about', hasLoad: true });
    expect(code).not.toContain('SEGMENTS');
    expect(code).not.toContain('extractParams');
    expect(code).toContain('await load({ params: {} })');
  });

  it('a page without load renders with empty data', () => {
    const code = emitRenderChunk({ pageModule: './index.fud', pattern: '/', hasLoad: false });
    expect(code).not.toContain('load');
    expect(code).toContain('const data = {};');
    expect(code).toContain('yield* page(data, io);');
  });

  it('a param route without load still needs no extractor (data is empty)', () => {
    const code = emitRenderChunk({
      pageModule: './p/[id].fud',
      pattern: '/p/:id',
      hasLoad: false,
    });
    expect(code).not.toContain('import { load }');
    expect(code).toContain('const data = {};');
  });
});
