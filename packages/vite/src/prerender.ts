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
import { NONCE_TOKEN, type RenderContext } from '@fudic/transport';
import { edgeContext } from './serve.js';

/** A minimal structural view of a Rollup output bundle (chunks carry code, assets a source). */
export interface BundleItem {
  readonly type: 'chunk' | 'asset';
  readonly code?: string;
  readonly source?: string | Uint8Array;
}

/** One `paths()` entry: a single param value, or an object mapping param name → value. */
type PathsEntry = string | number | Record<string, string | number>;

/** The wrapper module: the render fn, plus `paths()` when the page enumerates its param space. */
interface RenderModule {
  readonly render: (ctx: RenderContext) => ReadableStream<Uint8Array>;
  readonly paths?: () => PathsEntry[] | Promise<PathsEntry[]>;
}

/** A prerendered file, or a `paths()` entry that failed to cover every param (FUD0362). */
export interface EnumeratedResult {
  readonly files: ReadonlyArray<{ readonly path: string; readonly html: string }>;
  readonly incomplete: readonly string[];
}

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

/** Import a materialized wrapper chunk (its `default` renderer and optional `paths`). */
async function importRenderModule(chunkPath: string): Promise<RenderModule> {
  return (await import(pathToFileURL(chunkPath).href)) as RenderModule;
}

/**
 * Import a materialized wrapper chunk and render one route to an HTML string.
 *
 * The nonce is the literal `__FUDIC_NONCE__` token: a nonce baked at build time is a
 * constant, and a constant nonce is not a nonce. Whoever serves the file — the SW from
 * cache, or the server from disk — swaps it for a fresh one (SDD-20 §4.9.3).
 */
export async function renderChunkToHtml(
  chunkPath: string,
  pattern: string,
  url = pattern,
): Promise<string> {
  const mod = await importRenderModule(chunkPath);
  return drain(mod.render(prerenderContext(pattern, url)));
}

/** The prerender context: `origin: 'ssg'` and the nonce placeholder. */
function prerenderContext(pattern: string, url: string): RenderContext {
  return edgeContext(pattern, url, NONCE_TOKEN, 'ssg');
}

/**
 * Build the concrete URL for a `paths()` entry against a param pattern, or report the
 * first param the entry does not cover (FUD0362). A primitive entry fills the sole param;
 * an object fills params by name.
 */
export function urlForEntry(
  pattern: string,
  entry: PathsEntry,
): { readonly url: string } | { readonly missing: string } {
  const segments = pattern.split('/').filter((s) => s.length > 0);
  const params = segments.filter((s) => s.startsWith(':')).map((s) => s.slice(1));
  const values = new Map<string, string>();
  if (typeof entry === 'object') {
    for (const name of params) {
      const value = entry[name];
      if (value === undefined) return { missing: name };
      values.set(name, String(value));
    }
  } else {
    // A primitive only makes sense for a single-param pattern.
    if (params.length !== 1) return { missing: params.find((p) => true) ?? '' };
    values.set(params[0]!, String(entry));
  }
  const path = segments.map((s) => (s.startsWith(':') ? encodeURIComponent(values.get(s.slice(1))!) : s));
  return { url: `/${path.join('/')}` };
}

/** Enumerate a param route via its `paths()`, prerendering one HTML per covered entry. */
export async function prerenderEnumerated(chunkPath: string, pattern: string): Promise<EnumeratedResult> {
  const mod = await importRenderModule(chunkPath);
  if (typeof mod.paths !== 'function') {
    return { files: [], incomplete: [] };
  }
  const entries = await mod.paths();
  const files: Array<{ path: string; html: string }> = [];
  const incomplete: string[] = [];
  for (const entry of entries) {
    const built = urlForEntry(pattern, entry);
    if ('missing' in built) {
      incomplete.push(typeof entry === 'object' ? JSON.stringify(entry) : String(entry));
      continue;
    }
    files.push({
      path: htmlPathFor(built.url),
      html: await drain(mod.render(prerenderContext(pattern, built.url))),
    });
  }
  return { files, incomplete };
}
