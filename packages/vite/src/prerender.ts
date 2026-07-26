/**
 * Static prerender (SDD-19 §4.4, mode 1). For a `dynamic:false` route the SW never
 * intercepts (see the transport router: `!entry.dynamic → return`), so the URL must
 * resolve to a real `.html` on the server. This module produces those files by running
 * the SAME built `RenderChunk` the Web Worker would — `default(route)` returns the byte
 * stream, drained to a string. It is `out/run.mts` generalized: one `page`, and the
 * build joins its streamed pieces into a document instead of streaming them.
 *
 * Running the BUILT chunk (not a fresh compiler emit) is what makes prerender compose
 * with everything else: the hashed asset URLs (§4.5), `@server load` and the params
 * baked into the wrapper are already resolved in the chunk. To run it, the whole
 * emitted bundle is materialized to a temp dir so a chunk's sibling/shared imports
 * resolve, then the wrapper is imported and invoked.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** A minimal structural view of a Rollup output bundle (chunks carry code, assets a source). */
export interface BundleItem {
  readonly type: 'chunk' | 'asset';
  readonly code?: string;
  readonly source?: string | Uint8Array;
}

/** The route's default renderer: the wrapper's default export, `(route) => ReadableStream`. */
type RenderChunk = (route: string) => ReadableStream<Uint8Array>;

/** The output file path for a prerendered pattern: `/` → `index.html`, `/about` → `about/index.html`. */
export function htmlPathFor(pattern: string): string {
  const segments = pattern.split('/').filter((s) => s.length > 0);
  return segments.length === 0 ? 'index.html' : `${segments.join('/')}/index.html`;
}

/** Write every chunk and asset of a bundle to `dir`, preserving its fileName layout. */
export function materializeBundle(bundle: Record<string, BundleItem>, dir: string): void {
  for (const [fileName, item] of Object.entries(bundle)) {
    const abs = join(dir, fileName);
    mkdirSync(dirname(abs), { recursive: true });
    const content = item.type === 'chunk' ? (item.code ?? '') : (item.source ?? '');
    writeFileSync(abs, content);
  }
}

/** Drain a web `ReadableStream<Uint8Array>` into a UTF-8 string. */
async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

/** Import a materialized wrapper chunk and render one route to an HTML string. */
export async function renderChunkToHtml(chunkPath: string, route: string): Promise<string> {
  const mod = (await import(pathToFileURL(chunkPath).href)) as { default: RenderChunk };
  return drain(mod.default(route));
}
