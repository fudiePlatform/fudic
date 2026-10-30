/**
 * The route chunk wrapper (SDD-20 §3.4) — the heart of the plugin↔transport
 * integration. The compiler emits `page(data, io)`; the runtime wants
 * `render(ctx) => ReadableStream`. This generates the module that unites them.
 *
 * TWO variants of the same source, because the two callers are not the same:
 *
 *  - **edge** (`withLoad`): dev, preview and prerender. It runs the `load` of the route's
 *    `.fudapi` in process, and exports `data(ctx)` so the generated endpoint can reuse it and
 *    `paths()` so the build can enumerate.
 *  - **linked** (the Service Worker): NO `load`. Server code never ships to the
 *    client; the SW gets `ctx.data` already resolved from the data endpoint (§4.5).
 *
 * Pure text generation: the parsed facts are INJECTED so this stays testable and
 * compiler-free (DIP).
 */

import type { FramesShape } from '@fudic/api';
import type { PageAnalysis } from './analyze.js';
import type { RuntimeEntries } from './constants.js';
import { withLocale } from './i18n.js';

export interface RenderChunkOptions {
  /** Import specifier for the page module's `page(data, io)`. */
  readonly pageModule: string;
  /**
   * Linked variant of a route that resolves something: the types of its `load` as JSON, or
   * `null` when it resolves only `layout` (SDD-70 §3.7). Absent when it resolves nothing.
   */
  readonly frames?: FramesShape | null;
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
   * The route's `.fudapi` (SDD-60 §4.4): `load`, `paths` and `layout` are the pieces of
   * `fudic:<id>`, read from the registry once the generated root has loaded the
   * implementations. Absent when the route links none, and then it has none of the three.
   */
  readonly api?: {
    readonly id: string;
    /** It declares `load`: the edge resolves the data in process. */
    readonly load: boolean;
    /** It declares `paths`: the wrapper re-exports it so the build can enumerate. */
    readonly paths: boolean;
    /**
     * It declares `layout` — the layout props of this render (SDD-40 §3.2). Edge variant only,
     * like `load`: the Service Worker receives the resolved props by the same cable it
     * receives `data` (§4.5).
     */
    readonly layout: boolean;
    /** The id of the server root, whose `ready` the wrapper awaits. */
    readonly root: string;
    /** Dev: a `load` nobody implemented says so in its 404. */
    readonly dev: boolean;
    /** The locale the route is compiled for: its root and its contract are that locale's. */
    readonly locale?: string;
  };
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
  readonly runtime?: RuntimeEntries;
  /**
   * The locales of a page compiled for one of two or more (SDD-58 §4.7): its head carries its
   * own `<link rel="canonical">`, a `<link rel="alternate" hreflang>` per locale and `x-default`
   * on the URL without a prefix. Each one is the URL of THIS request with the prefix changed —
   * so a route with parameters points at the same page — and absolute, on `site` or, without
   * it, on the request's origin.
   */
  readonly alternates?: {
    readonly locale: string;
    readonly locales: readonly string[];
    readonly base: string;
    readonly site?: string;
  };
}

/** The wrapper's `$alternates(url)`: the links of §4.7, composed per request. */
function alternatesSource(a: NonNullable<RenderChunkOptions['alternates']>): string[] {
  return [
    `const $ALT = ${JSON.stringify(a)};`,
    'function $alternates(url) {',
    '  let path = url.pathname;',
    '  if (path.startsWith($ALT.base)) path = path.slice($ALT.base.length - 1);',
    "  const rest = path.slice($ALT.locale.length + 1);",
    '  const at = ($ALT.site ?? url.origin) + $ALT.base;',
    "  const href = (l) => at + l + (rest === '' ? '/' : rest);",
    "  const link = (rel, lang, to) => '<link rel=\"' + rel + '\"' + (lang === '' ? '' : ' hreflang=\"' + lang + '\"') + ' href=\"' + escapeAttr(to) + '\">';",
    "  return link('canonical', '', href($ALT.locale))",
    "    + $ALT.locales.map((l) => link('alternate', l, href(l))).join('')",
    "    + link('alternate', 'x-default', at + rest.slice(1));",
    '}',
    '',
  ];
}

/** Generate the route chunk module text. */
export function emitRenderChunk(options: RenderChunkOptions): string {
  const spec = JSON.stringify(options.pageModule);
  const api = options.api;
  const edgeLoad = options.withLoad && api?.load === true;
  // The layout resolver, on the same terms as `load`: in process on the edge, never in the
  // Service Worker. It is imported under another name because `layout` is what the PAGE
  // module calls its own composition function, and one file should not hold two.
  const edgeLayout = options.withLoad && api?.layout === true;
  const edgePaths = options.withLoad && api?.paths === true;

  const lines: string[] = [];
  const hasDi = options.hasDi === true;
  // `load` and `layout` run as part of the request (SDD-56 §4.6): inside `withRequest`, so
  // `inject()` and `publish()` find this request's container, and through the server halves
  // of their chains. Their `ctx` is a `ServerContext` (§4.16).
  const http = edgeLoad || edgeLayout;
  const ssr = [
    'SsrDom',
    'serializeChunks',
    'htmlToByteStream',
    'escapeText',
    // The shell's opening tag is composed as a string, before there is a DOM to build it in,
    // and since SDD-40 §4.4 its attributes are interpolated rather than sliced out of the
    // source — so the layout needs the serializer's own escaping to stay byte-identical.
    'escapeAttr',
    // And the URL guard, for the same opening tags: a `<link href="@x">` in the head is a URL
    // written as a string, and it must come out as the body's `setUrl` writes it (SDD-51 §3.7).
    'guardUrl',
    'jsonBlock',
    // What a page writes `fud-data` with when its `.fudapi` gave the shape of `data` (BUG-60 §3.2).
    'packData',
    // What a page with `@await` sends its parts through (SDD-70 §4.2).
    'PageParts',
    ...(hasDi ? ['iocRoot', 'publishedSeed'] : http ? ['iocRoot'] : []),
  ];
  lines.push(`import { page } from ${spec};`);
  lines.push(`import { ${ssr.join(', ')} } from "@fudic/ssr";`);
  if (http) lines.push('import { markPrivate, pageContext, withRequest } from "@fudic/http/server";');
  // The frames of the data endpoint (SDD-70 §3.7), written on the edge.
  if (http) lines.push('import { writeFrames } from "@fudic/http/wire/frames";');
  const pieces = [
    ...(edgeLoad ? ['load as $load'] : []),
    ...(edgeLayout ? ['layout as $layout'] : []),
    ...(edgePaths ? ['paths as $paths'] : []),
  ];
  if (api !== undefined && pieces.length > 0) {
    // The pieces of the route's contract, and the root that fills them (SDD-60 §4.4).
    const tagged = (id: string): string => (api.locale === undefined ? id : withLocale(id, api.locale));
    lines.push(`import { ready as $ready } from ${JSON.stringify(tagged(api.root))};`);
    lines.push(`import { ${pieces.join(', ')} } from ${JSON.stringify(tagged(`fudic:${api.id}`))};`);
    lines.push('import { implementation as $impl, runLoad as $runLoad } from "@fudic/http/contract/server";');
    lines.push('');
    // The same names the rest of this module reads, on the registry. Each one waits for the
    // implementations: a duplicate or a wrong folder fails here, with its own message.
    if (edgeLayout) {
      lines.push('async function layoutProps(ctx, data) {', '  await $ready;', '  return $impl($layout)(ctx, data);', '}');
    }
    if (edgePaths) {
      // Re-exported so the build can enumerate the param space at prerender time.
      lines.push('export async function paths() {', '  await $ready;', '  return $impl($paths)();', '}');
    }
  }
  lines.push('');
  const loadCall = `$ready.then(() => $runLoad($load, $ctx, ${String(api?.dev === true)}))`;
  // `io.nonce` is the CSP nonce of THIS response: the emit puts it on the inline
  // style-adoption polyfill, which a strict `script-src 'self'` would otherwise kill.
  // The two main-thread entries, by URL (BUG-31 §T1).
  const runtime = options.runtime ?? { boot: '', main: '', pieces: [], inline: '' };
  lines.push(`const RUNTIME = ${JSON.stringify(runtime)};`);
  lines.push('');
  if (options.alternates !== undefined) lines.push(...alternatesSource(options.alternates));
  lines.push('function io(ctx) {');
  lines.push(
    `  return { createDom: () => new SsrDom(), serialize: serializeChunks, escapeText, escapeAttr, guardUrl, jsonBlock, packData${hasDi ? ', iocRoot, publishedSeed' : ''}, parts: (dom, body, o) => new PageParts(dom, body, o), onError: ctx.onError, nonce: ctx.nonce, runtime: RUNTIME${options.alternates !== undefined ? ', alternates: $alternates(ctx.url)' : ''} };`,
  );
  lines.push('}');
  lines.push('');

  // The data endpoint: ONE response carrying both halves (§3.3). It exists whenever the route
  // resolves anything for a render — `load`, `layout`, or both — because the Service Worker
  // executes neither and has no other way to be handed them.
  //
  // It answers with frames (SDD-70 §3.7): `load` and `layout` are awaited first — what they
  // throw is the endpoint's status — and then the stream carries what they resolved, and each
  // `later` field as it settles.
  if (http) {
    lines.push('export async function data(ctx) {');
    lines.push('  const $root = iocRoot();');
    lines.push('  const $ctx = pageContext(ctx);');
    lines.push('  return withRequest($root, async () => {');
    lines.push(`    const data = ${edgeLoad ? `await ${loadCall}` : '{}'};`);
    lines.push(`    return writeFrames(${edgeLoad ? '$load.spec' : '{}'}, data${edgeLayout ? ', await layoutProps($ctx, data)' : ''});`);
    // What read the session goes out private, also when it threw (SDD-69 §3.2).
    lines.push('  }).finally(() => markPrivate($ctx.response));');
    lines.push('}');
    lines.push('');
  }
  // The Service Worker's half of the same endpoint: the types of this route's `load`, as JSON,
  // which the worker reads the frames with. Data and not an import: the worker never loads a
  // module of the `.fudapi` (§4.5). `null` for a route whose `.fudapi` resolves only `layout`.
  if (!options.withLoad && options.frames !== undefined) {
    lines.push(`export const dataShape = ${JSON.stringify(options.frames)};`);
    lines.push('');
  }

  lines.push('export function render(ctx) {');
  lines.push('  return htmlToByteStream((async function* () {');
  // ONE container per request, opened before `load` and handed to the page: what `load`
  // injects and what the components inject have to be the same instances, or a `@Service`
  // would be built twice for one response.
  if (hasDi || http) {
    lines.push('    const $root = iocRoot();');
  }
  if (http) {
    lines.push('    const $ctx = pageContext(ctx);');
    // `load` and `layout` in one block, so that what read the session goes out private, also
    // when it threw (SDD-69 §3.2): the server that answers holds another copy of `@fudic/http`.
    lines.push('    const [data, layout] = await (async () => {');
  }
  if (edgeLoad) {
    lines.push(
      `    const data = ctx.data !== undefined ? ctx.data : await withRequest($root, () => ${loadCall});`,
    );
  } else {
    lines.push('    const data = ctx.data !== undefined ? ctx.data : {};');
  }
  // AFTER `load`, and with what it resolved in hand (§4.2). `ctx.layout` first for the same
  // reason `ctx.data` comes first: the Service Worker was handed both already resolved, and
  // running the resolver there is not a fallback, it is impossible.
  //
  // The bare `ctx`, never the one with the container on it (BUG-44): a service the props need
  // is `load`'s to inject, and it reaches the resolver in `data`. The data endpoint above
  // already hands it the bare one, so the two paths cannot disagree.
  if (edgeLayout) {
    lines.push(
      '    const layout = ctx.layout !== undefined ? ctx.layout : await withRequest($root, () => layoutProps($ctx, data));',
    );
  } else {
    lines.push('    const layout = ctx.layout;');
  }
  if (http) {
    lines.push('    return [data, layout];');
    lines.push('    })().finally(() => markPrivate($ctx.response));');
  }
  lines.push(`    yield* page(data, io(ctx), ${hasDi ? '$root' : 'undefined'}, layout);`);
  lines.push('  })());');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

/**
 * The `api` of a route's wrapper (SDD-60 §4.4), from what discovery read of the `.fudapi` it
 * links; `{}` when it links none.
 */
export function routeApi(
  rb: { readonly analysis: PageAnalysis; readonly locale?: string },
  root: string,
  dev: boolean,
): Pick<RenderChunkOptions, 'api'> {
  const { analysis } = rb;
  if (analysis.api === undefined) return {};
  return {
    api: {
      id: analysis.api,
      load: analysis.hasLoad,
      paths: analysis.hasPaths,
      layout: analysis.hasLayout,
      root,
      dev,
      ...(rb.locale !== undefined ? { locale: rb.locale } : {}),
    },
  };
}
