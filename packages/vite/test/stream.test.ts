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
import { resolveComponents, emitPageModule } from '@fudic/compiler';
import { SsrDom, serializeChunks, escapeText, htmlToByteStream } from '@fudic/ssr';
import { nodeIo } from '../src/io.js';

const PAGE = `<!DOCTYPE html>
<html>
<head><title>HEADMARKER</title></head>
<body><h1>BODYMARKER</h1></body>
</html>
`;

type Io = { createDom: () => SsrDom; serialize: typeof serializeChunks; escapeText: typeof escapeText };
type PageFn = (data: unknown, io: Io) => Iterable<string>;

const io = (): Io => ({ createDom: () => new SsrDom(), serialize: serializeChunks, escapeText });

let page: PageFn;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fudic-stream-'));
  mkdirSync(dir, { recursive: true });
  const fud = join(dir, 'index.fud');
  writeFileSync(fud, PAGE);
  const graph = resolveComponents(fud, nodeIo());
  writeFileSync(join(dir, 'index.mjs'), emitPageModule(graph), 'utf8');
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
    const joined = [...page({}, io())].join('');
    expect(streamed).toBe(joined);
    expect(joined.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(joined).toContain('BODYMARKER');
  });
});
