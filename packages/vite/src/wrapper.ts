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

import type { RuntimeEntries } from './constants.js';
import { withLocale } from './i18n.js';

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
  /** Whether the `@server` writes `export const http`, the file's level of the chain (SDD-56). */
  readonly hasHttp?: boolean;
  /** Whether `load` is written fluent and carries its own level of the chain (SDD-56). */
  readonly fluentLoad?: boolean;
  /** Import specifier of `src/http.ts`, the global level of the chain, when the project has one. */
  readonly globalChain?: string;
  /**
   * The `<id>` of the route's `.fudapi` (SDD-60 §4.4): `load`, `paths` and `layout` are then
   * the pieces of `fudic:<id>`, read from the registry once the generated root has loaded the
   * implementations — and no longer the exports of `<f>.fud?server`.
   */
  readonly api?: {
    readonly id: string;
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
  // A page compiled for a locale already has a query (`x.fud?locale=en`, SDD-58).
  const server = JSON.stringify(`${options.pageModule}${options.pageModule.includes('?') ? '&' : '?'}server`);
  const edgeLoad = options.withLoad && options.hasLoad;
  // The layout resolver, on the same terms as `load`: in process on the edge, never in the
  // Service Worker. It is imported under another name because `layout` is what the PAGE
  // module calls its own composition function, and one file should not hold two.
  const edgeLayout = options.withLoad && options.hasLayout === true;

  const lines: string[] = [];
  const hasDi = options.hasDi === true;
  // `load` and `layout` run as part of the request (SDD-56 §4.6): inside `withRequest`, so
  // `inject()` and `publish()` find this request's container, and through the server halves
  // of the chain. `load` always: its `ctx` is a `ServerContext` whether or not there is a chain
  // (§4.16). A `layout` alone, only when the route has a container to find or a chain to walk.
  const hasHttp = options.hasHttp === true;
  const api = options.api;
  const http =
    edgeLoad ||
    (edgeLayout && (api !== undefined || hasDi || hasHttp || options.fluentLoad === true || options.globalChain !== undefined));
  const outer = [
    ...(options.globalChain !== undefined ? ['global: $global'] : []),
    ...(hasHttp ? ['file: $http'] : []),
  ].join(', ');
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
    ...(hasDi ? ['iocRoot', 'publishedSeed'] : http ? ['iocRoot'] : []),
  ];
  lines.push(`import { page } from ${spec};`);
  lines.push(`import { ${ssr.join(', ')} } from "@fudic/ssr";`);
  if (http) {
    lines.push('import { pageContext, runLoad, withRequest } from "@fudic/http/server";');
    if (options.globalChain !== undefined) {
      lines.push(`import $global from ${JSON.stringify(options.globalChain)};`);
    }
    if (hasHttp) {
      lines.push(`import { http as $http } from ${server};`);
    }
  }
  const pieces = [
    ...(edgeLoad ? ['load as $load'] : []),
    ...(edgeLayout ? ['layout as $layout'] : []),
    ...(options.withLoad && options.hasPaths ? ['paths as $paths'] : []),
  ];
  if (api !== undefined && pieces.length > 0) {
    // The pieces of the route's contract, and the root that fills them (SDD-60 §4.4).
    const tagged = (id: string): string => (api.locale === undefined ? id : withLocale(id, api.locale));
    lines.push(`import { ready as $ready } from ${JSON.stringify(tagged(api.root))};`);
    lines.push(`import { ${pieces.join(', ')} } from ${JSON.stringify(tagged(`fudic:${api.id}`))};`);
    lines.push('import { implementation as $impl, runLoad as $runLoad } from "@fudic/http/contract/server";');
  } else {
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
  }
  lines.push('');
  if (api !== undefined && pieces.length > 0) {
    // The same names the rest of this module reads, on the registry. Each one waits for the
    // implementations: a duplicate or a wrong folder fails here, with its own message.
    if (edgeLayout) {
      lines.push('async function layoutProps(ctx, data) {', '  await $ready;', '  return $impl($layout)(ctx, data);', '}');
    }
    if (options.withLoad && options.hasPaths) {
      lines.push('export async function paths() {', '  await $ready;', '  return $impl($paths)();', '}');
    }
    lines.push('');
  }
  const loadCall =
    api !== undefined
      ? `$ready.then(() => $runLoad($load, $ctx, ${String(api.dev)}))`
      : `runLoad(load, { ${outer} }, $ctx)`;
  // `io.nonce` is the CSP nonce of THIS response: the emit puts it on the inline
  // style-adoption polyfill, which a strict `script-src 'self'` would otherwise kill.
  // The two main-thread entries, by URL (BUG-31 §T1).
  const runtime = options.runtime ?? { boot: '', main: '', pieces: [], inline: '' };
  lines.push(`const RUNTIME = ${JSON.stringify(runtime)};`);
  lines.push('');
  if (options.alternates !== undefined) lines.push(...alternatesSource(options.alternates));
  lines.push('function io(ctx) {');
  lines.push(
    `  return { createDom: () => new SsrDom(), serialize: serializeChunks, escapeText, escapeAttr, guardUrl, jsonBlock${hasDi ? ', iocRoot, publishedSeed' : ''}, nonce: ctx.nonce, runtime: RUNTIME${options.alternates !== undefined ? ', alternates: $alternates(ctx.url)' : ''} };`,
  );
  lines.push('}');
  lines.push('');

  // The data endpoint: ONE response carrying both halves (§3.3). It exists whenever the route
  // resolves anything for a render — `load`, `layout`, or both — because the Service Worker
  // executes neither and has no other way to be handed them.
  if (http) {
    lines.push('export async function data(ctx) {');
    lines.push('  const $root = iocRoot();');
    lines.push('  const $ctx = pageContext(ctx);');
    lines.push('  return withRequest($root, async () => {');
    lines.push(`    const data = ${edgeLoad ? `await ${loadCall}` : '{}'};`);
    lines.push(`    return { data${edgeLayout ? ', layout: await layoutProps($ctx, data)' : ''} };`);
    lines.push('  });');
    lines.push('}');
    lines.push('');
  } else if (edgeLayout) {
    // No `load` here: a route with one always takes the branch above.
    lines.push('export async function data(ctx) {');
    lines.push('  const data = {};');
    lines.push('  return { data, layout: await layoutProps(ctx, data) };');
    lines.push('}');
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
  // running `@server` there is not a fallback, it is impossible.
  //
  // The bare `ctx`, never the one with the container on it (BUG-44): a service the props need
  // is `load`'s to inject, and it reaches the resolver in `data`. The data endpoint above
  // already hands it the bare one, so the two paths cannot disagree.
  if (http && edgeLayout) {
    lines.push(
      '    const layout = ctx.layout !== undefined ? ctx.layout : await withRequest($root, () => layoutProps($ctx, data));',
    );
  } else if (edgeLayout) {
    lines.push(
      '    const layout = ctx.layout !== undefined ? ctx.layout : await layoutProps(ctx, data);',
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
