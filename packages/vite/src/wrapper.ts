/**
 * The `RenderChunk` wrapper generator (SDD-19 §4.3) — the heart of the plugin↔
 * transport integration. The WW expects a chunk whose `default` export is
 * `(route: string) => ReadableStream<Uint8Array>` and calls it with the RAW route.
 * The compiler emits `page(data, io)`. This generator produces the wrapper that
 * unites them, closing over the route's baked-in pattern so params, `load` and
 * serialization all live INSIDE the chunk — the transport contract gains no
 * params, and the per-id cache key falls out of the concrete URL for free.
 *
 * Streaming a trozos (Pedro's decision): `page` is emitted as a generator that
 * yields the `<head>` first and then the body by pieces via `serializeChunks`;
 * `htmlToByteStream` turns them into a byte stream with backpressure.
 *
 * Pure text generation: the parsed facts (pattern, whether the page exports
 * `load`) are INJECTED so this stays testable and compiler-free (DIP). The plugin
 * glue derives those facts from the compiler and calls this.
 */

export interface RenderChunkOptions {
  /** Import specifier for the page module's `page(data, io)` (e.g. `./customer/[id].fud`). */
  readonly pageModule: string;
  /** The route pattern, e.g. `/customer/:id` — its segments are baked into the chunk. */
  readonly pattern: string;
  /** Whether the page's `@server` region exports a `load(ctx)` data hook. */
  readonly hasLoad: boolean;
  /** Whether it exports `paths()`; the wrapper re-exports it so the build can enumerate. */
  readonly hasPaths?: boolean;
}

/** Segments of a pattern, empty ones dropped. `/` → `[]`; `/customer/:id` → `['customer', ':id']`. */
function segmentsOf(pattern: string): string[] {
  return pattern.split('/').filter((s) => s.length > 0);
}

/** Generate the `RenderChunk` module text for one page route. */
export function emitRenderChunk(options: RenderChunkOptions): string {
  const segments = segmentsOf(options.pattern);
  const hasParams = segments.some((s) => s.startsWith(':'));
  const spec = JSON.stringify(options.pageModule);

  const lines: string[] = [];
  lines.push(`import { page } from ${spec};`);
  lines.push(`import { SsrDom, serializeChunks, htmlToByteStream, escapeText } from "@fudic/ssr";`);
  if (options.hasLoad) {
    lines.push(`import { load } from ${JSON.stringify(`${options.pageModule}?server`)};`);
  }
  if (options.hasPaths) {
    // Re-exported so the build can enumerate the param space at prerender time (§4.4/§6.6).
    lines.push(`export { paths } from ${JSON.stringify(`${options.pageModule}?server`)};`);
  }
  lines.push('');
  if (hasParams) {
    lines.push(`const SEGMENTS = ${JSON.stringify(segments)};`);
  }
  lines.push('const io = { createDom: () => new SsrDom(), serialize: serializeChunks, escapeText };');
  lines.push('');

  if (hasParams) {
    lines.push('function extractParams(route) {');
    lines.push('  const parts = (route.split("?")[0] ?? "").split("/").filter(Boolean);');
    lines.push('  const params = {};');
    lines.push('  for (let i = 0; i < SEGMENTS.length; i += 1) {');
    lines.push('    const seg = SEGMENTS[i];');
    lines.push('    if (seg[0] === ":") params[seg.slice(1)] = parts[i];');
    lines.push('  }');
    lines.push('  return params;');
    lines.push('}');
    lines.push('');
  }

  // The data source: `load` (if present) fed the params; else an empty object.
  const dataExpr = options.hasLoad
    ? `await load({ params: ${hasParams ? 'extractParams(route)' : '{}'} })`
    : '{}';

  lines.push('export default function (route) {');
  lines.push('  return htmlToByteStream((async function* () {');
  lines.push(`    const data = ${dataExpr};`);
  lines.push('    yield* page(data, io);');
  lines.push('  })());');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}
