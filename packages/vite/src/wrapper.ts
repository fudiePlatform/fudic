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
  /**
   * Whether it exports `layout(ctx, data)` — the layout props of this render (SDD-40 §3.2).
   *
   * Edge variant only, like `load`: `@server` never ships to a client bundle, so the Service
   * Worker receives the resolved props by the same cable it receives `data` (§4.5).
   */
  readonly hasLayout?: boolean;
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
  /**
   * The URLs of the two main-thread entries, which the page writes into its `<head>`
   * (BUG-31 §T1): `boot` registers the Service Worker and rides every page, `main` is the
   * hydration runtime and rides only a page that hydrates.
   *
   * They are assembled by the CALLER and not by the compiler, and that is the package
   * boundary doing its job: the compiler decides WHETHER a page loads the runtime and where
   * the tag goes — facts about the page — while where the file lives is a fact about the
   * build. The caller is also what makes dev work: in a build these carry `BUILD_TOKEN` and
   * the plugin substitutes it, in dev they are the dev server's two stable URLs.
   */
  readonly runtime?: { readonly boot: string; readonly main: string };
}

/** Generate the route chunk module text. */
export function emitRenderChunk(options: RenderChunkOptions): string {
  const spec = JSON.stringify(options.pageModule);
  const server = JSON.stringify(`${options.pageModule}?server`);
  const edgeLoad = options.withLoad && options.hasLoad;
  // The layout resolver, on the same terms as `load`: in process on the edge, never in the
  // Service Worker. It is imported under another name because `layout` is what the PAGE
  // module calls its own composition function, and one file should not hold two.
  const edgeLayout = options.withLoad && options.hasLayout === true;

  const lines: string[] = [];
  const hasDi = options.hasDi === true;
  const ssr = [
    'SsrDom',
    'serializeChunks',
    'htmlToByteStream',
    'escapeText',
    // The shell's opening tag is composed as a string, before there is a DOM to build it in,
    // and since SDD-40 §4.4 its attributes are interpolated rather than sliced out of the
    // source — so the layout needs the serializer's own escaping to stay byte-identical.
    'escapeAttr',
    'jsonBlock',
    ...(hasDi ? ['iocRoot', 'publishedSeed', 'withDi'] : []),
  ];
  lines.push(`import { page } from ${spec};`);
  lines.push(`import { ${ssr.join(', ')} } from "@fudic/ssr";`);
  if (edgeLoad) {
    lines.push(`import { load } from ${server};`);
  }
  if (edgeLayout) {
    lines.push(`import { layout as layoutProps } from ${server};`);
  }
  if (options.withLoad && options.hasPaths) {
    // Re-exported so the build can enumerate the param space at prerender time.
    lines.push(`export { paths } from ${server};`);
  }
  lines.push('');
  // `io.nonce` is the CSP nonce of THIS response: the emit puts it on the inline
  // style-adoption polyfill, which a strict `script-src 'self'` would otherwise kill.
  // The two main-thread entries, by URL (BUG-31 §T1).
  const runtime = options.runtime ?? { boot: '', main: '' };
  lines.push(`const RUNTIME = ${JSON.stringify(runtime)};`);
  lines.push('');
  lines.push('function io(ctx) {');
  lines.push(
    `  return { createDom: () => new SsrDom(), serialize: serializeChunks, escapeText, escapeAttr, jsonBlock${hasDi ? ', iocRoot, publishedSeed' : ''}, nonce: ctx.nonce, runtime: RUNTIME };`,
  );
  lines.push('}');
  lines.push('');

  // The data endpoint: ONE response carrying both halves (§3.3). It exists whenever the route
  // resolves anything for a render — `load`, `layout`, or both — because the Service Worker
  // executes neither and has no other way to be handed them.
  if (edgeLoad || edgeLayout) {
    lines.push('export async function data(ctx) {');
    lines.push(`  const data = ${edgeLoad ? 'await load(ctx)' : '{}'};`);
    lines.push(`  return { data${edgeLayout ? ', layout: await layoutProps(ctx, data)' : ''} };`);
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
  // AFTER `load`, and with what it resolved in hand (§4.2). `ctx.layout` first for the same
  // reason `ctx.data` comes first: the Service Worker was handed both already resolved, and
  // running `@server` there is not a fallback, it is impossible.
  if (edgeLayout) {
    lines.push(
      `    const layout = ctx.layout !== undefined ? ctx.layout : await layoutProps(${hasDi ? 'withDi(ctx, $root)' : 'ctx'}, data);`,
    );
  } else {
    lines.push('    const layout = ctx.layout;');
  }
  lines.push(`    yield* page(data, io(ctx), ${hasDi ? '$root' : 'undefined'}, layout);`);
  lines.push('  })());');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}
