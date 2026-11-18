/**
 * SDD-19 §6.8b: the page renders "a trozos" — the emitted `page` generator yields the
 * whole `<head>` FIRST, before the body is serialized. Read as a byte stream (one flush
 * per piece), the `<head>` arrives in an early chunk without the body having been
 * produced; and joining the streamed pieces is byte-identical to the mode-1 `.html`
 * (the same generator, joined instead of streamed).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveDocument, emitLayoutModule, emitRouteModule } from '@fudic/compiler';
import { SsrDom, serializeChunks, escapeText, htmlToByteStream } from '@fudic/ssr';
import { nodeIo } from '../src/io.js';

/** Every page links a layout (SDD-88): the smallest one, which adds nothing to the body. */
const LAYOUT = `<!DOCTYPE html>
<html>
<head>@RenderHead()</head>
<body>@RenderBody()</body>
</html>
`;

const PAGE = `<link rel="layout" href="./_layout.fud">
<head><title>HEADMARKER</title></head>
<h1>BODYMARKER</h1>
`;

type Io = { createDom: () => SsrDom; serialize: typeof serializeChunks; escapeText: typeof escapeText };
/** A route's `page` is an async generator: it awaits its layout's pieces (SDD-21). */
type PageFn = (data: unknown, io: Io) => AsyncIterable<string>;

const io = (): Io => ({ createDom: () => new SsrDom(), serialize: serializeChunks, escapeText });

let page: PageFn;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fudic-stream-'));
  mkdirSync(dir, { recursive: true });
  const fud = join(dir, 'index.fud');
  writeFileSync(fud, PAGE);
  writeFileSync(join(dir, '_layout.fud'), LAYOUT);
  const graph = resolveDocument(fud, nodeIo()).value;
  // The route imports its layout as the sibling `./_layout.mjs`.
  writeFileSync(join(dir, '_layout.mjs'), emitLayoutModule(graph, graph.layouts[0]!), 'utf8');
  writeFileSync(join(dir, 'index.mjs'), emitRouteModule(graph), 'utf8');
  const mod = (await import(pathToFileURL(join(dir, 'index.mjs')).href)) as { page: PageFn };
  page = mod.page;
});

/** Drain a byte stream into the ordered array of decoded text chunks. */
async function chunks(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const out: string[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) out.push(decoder.decode(value));
  }
  return out;
}

describe('streaming a trozos (§6.8b)', () => {
  it('emits the <head> in an early chunk, before the body is produced', async () => {
    // highWaterMark: 1 flushes each generator piece as its own chunk, so ordering is observable.
    const parts = await chunks(htmlToByteStream(page({}, io()), { highWaterMark: 1 }));
    expect(parts[0]).toContain('</head>');
    expect(parts[0]).toContain('HEADMARKER');
    expect(parts[0]).not.toContain('BODYMARKER'); // the head arrived without consuming the body
    const bodyAt = parts.findIndex((p) => p.includes('BODYMARKER'));
    expect(bodyAt).toBeGreaterThan(0); // the body streams in a later chunk
  });

  it('joins byte-identically to the non-streamed document (mode-1 .html)', async () => {
    const streamed = (await chunks(htmlToByteStream(page({}, io()), { highWaterMark: 1 }))).join('');
    let joined = '';
    for await (const piece of page({}, io())) joined += piece;
    expect(streamed).toBe(joined);
    expect(joined.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(joined).toContain('BODYMARKER');
  });
});
