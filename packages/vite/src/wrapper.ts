/**
 * The route chunk wrapper (SDD-20 §3.4) — the heart of the plugin↔transport
 * integration. The compiler emits `page(data, io)`; the runtime wants
 * `render(ctx) => ReadableStream`. This generates the module that unites them.
 *
 * TWO variants of the same source, because the two callers are not the same:
 *
 *  - **edge** (`withLoad`): dev, preview and prerender. It calls `@server load(ctx)`
 *    in process, and exports `data(ctx)` so the generated endpoint can reuse it and
 *    `paths()` so the build can enumerate.
 *  - **linked** (the Service Worker): NO `load`. Server code never ships to the
 *    client; the SW gets `ctx.data` already resolved from the data endpoint (§4.5).
 *
 * Pure text generation: the parsed facts are INJECTED so this stays testable and
 * compiler-free (DIP).
 */

export interface RenderChunkOptions {
  /** Import specifier for the page module's `page(data, io)`. */
  readonly pageModule: string;
  /** Whether the page's `@server` region exports a `load(ctx)` data hook. */
  readonly hasLoad: boolean;
  /** Whether it exports `paths()`; the wrapper re-exports it so the build can enumerate. */
  readonly hasPaths?: boolean;
  /** Edge variant: resolve data in process. Off for the linked (SW) variant. */
  readonly withLoad: boolean;
  /**
   * Whether any component this route reaches injects or provides (SDD-38 §4.7).
   *
   * It decides whether the request opens a container tree at all. A route without a single
   * DI call imports nothing of the injector and publishes no map — «a route without `inject`
   * does not download a line of DI» is enforced here, where the import is written.
   */
  readonly hasDi?: boolean;
}

/** Generate the route chunk module text. */
export function emitRenderChunk(options: RenderChunkOptions): string {
  const spec = JSON.stringify(options.pageModule);
  const server = JSON.stringify(`${options.pageModule}?server`);
  const edgeLoad = options.withLoad && options.hasLoad;

  const lines: string[] = [];
  const hasDi = options.hasDi === true;
  const ssr = [
    'SsrDom',
    'serializeChunks',
    'htmlToByteStream',
    'escapeText',
    'jsonBlock',
    ...(hasDi ? ['iocRoot', 'publishedSeed', 'withDi'] : []),
  ];
  lines.push(`import { page } from ${spec};`);
  lines.push(`import { ${ssr.join(', ')} } from "@fudic/ssr";`);
  if (edgeLoad) {
    lines.push(`import { load } from ${server};`);
  }
  if (options.withLoad && options.hasPaths) {
    // Re-exported so the build can enumerate the param space at prerender time.
    lines.push(`export { paths } from ${server};`);
  }
  lines.push('');
  // `io.nonce` is the CSP nonce of THIS response: the emit puts it on the inline
  // style-adoption polyfill, which a strict `script-src 'self'` would otherwise kill.
  lines.push('function io(ctx) {');
  lines.push(
    `  return { createDom: () => new SsrDom(), serialize: serializeChunks, escapeText, jsonBlock${hasDi ? ', iocRoot, publishedSeed' : ''}, nonce: ctx.nonce };`,
  );
  lines.push('}');
  lines.push('');

  if (edgeLoad) {
    lines.push('export async function data(ctx) {');
    lines.push('  return load(ctx);');
    lines.push('}');
    lines.push('');
  }

  lines.push('export function render(ctx) {');
  lines.push('  return htmlToByteStream((async function* () {');
  // ONE container per request, opened before `load` and handed to the page: what `load`
  // injects and what the components inject have to be the same instances, or a `@Service`
  // would be built twice for one response.
  if (hasDi) {
    lines.push('    const $root = iocRoot();');
  }
  if (edgeLoad) {
    lines.push(
      `    const data = ctx.data !== undefined ? ctx.data : await load(${hasDi ? 'withDi(ctx, $root)' : 'ctx'});`,
    );
  } else {
    lines.push('    const data = ctx.data !== undefined ? ctx.data : {};');
  }
  lines.push(`    yield* page(data, io(ctx)${hasDi ? ', $root' : ''});`);
  lines.push('  })());');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}
