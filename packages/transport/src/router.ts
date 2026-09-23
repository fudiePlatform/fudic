/**
 * The Service Worker router (SDD-20 §4.4) — where the render lives now.
 *
 * A Web Worker cannot render during a navigation: it belongs to its document and dies
 * with it, so the stream never closes (measured in Chromium 151 and WebKit 26.5). The
 * Service Worker belongs to no document: it owns the `Response` from start to finish
 * and keeps emitting after the navigation commits. And because it answers a REAL
 * navigation, the browser's parser materializes `<template shadowrootmode>` natively.
 *
 * The one rule that governs everything here:
 *
 *   `respondWith()` is called ONLY when the SW is going to render/serve for real.
 *   In any other case: `return`, and the request is not touched.
 *
 * Intercepting and then re-issuing with `fetch(request)` duplicates the document
 * request — two rows in the Network panel for one URL. That was a real bug.
 */

import { applyNonce, applyNonceStream, cspFor, newNonce, NONCE_TOKEN } from './csp.js';
import { type Linker } from './linker.js';
import {
  fillParams,
  type RouteMode,
  type RouteRecord,
  type RouteTable,
  type CachePolicy,
} from './manifest.js';
import { type Store } from './store.js';

/**
 * Structural view of the ServiceWorker `FetchEvent` (lib.dom carries no SW types, and
 * lib.webworker cannot be mixed with DOM in one compilation).
 */
export interface FetchEvent {
  readonly request: Request;
  respondWith(response: Response | PromiseLike<Response>): void;
  waitUntil(promise: Promise<unknown>): void;
}

export interface RenderContext {
  readonly origin: 'edge' | 'sw' | 'ssg';
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
  readonly mode: RouteMode;
  /** The nonce of THIS response; the chunk passes it to `io` for the polyfill. */
  readonly nonce: string;
  /** Already-resolved data: the SW asks the endpoint, the edge calls `load` in process. */
  readonly data?: unknown;
  /**
   * The layout props of this render, already resolved (SDD-40 §3.3).
   *
   * Beside `data` and never inside it: what a route paints and what its layout needs are two
   * shapes, and mixing them makes the second one an accident of the first. It arrives the same
   * two ways `data` does — `layout(ctx, data)` in process on the edge, the data endpoint in
   * the Service Worker — and the endpoint answers with the two in ONE response, because they
   * are one request and come out of one instant of it.
   */
  readonly layout?: unknown;
}

/**
 * The layout props of one render (SDD-40 §3.2): the third reserved export of a route's
 * `@server`, beside `load` and `paths`.
 *
 * It runs AFTER `load` and receives what it resolved, and that order is the whole of why it
 * takes two parameters: a resolver that could only read the context would be stuck halfway,
 * because a culture comes as readily out of the row `load` just fetched as out of the URL.
 *
 * What it returns travels beside `data` and never inside it — what a route paints and what
 * its layout needs are two shapes, and mixing them makes the second an accident of the first.
 */
export type LayoutResolver<D = unknown, P = unknown> = (
  ctx: RenderContext,
  data: D,
) => P | Promise<P>;

/** What a linked route chunk exports. The plugin generates it (SDD-20 §3.4). */
export interface RouteChunk {
  render(ctx: RenderContext): ReadableStream<Uint8Array>;
}

/** A `sw.json` resource class, already compiled and in evaluation order. */
export interface ResourceRule {
  readonly pattern: string; // glob: `/api/**`
  readonly policy: CachePolicy;
  readonly ttl: number | null;
  readonly maxEntries?: number;
}

export interface RouterStores {
  /**
   * Preloaded by `install`. Served cache-first: within a build the shell is immutable
   * by construction, because the cache name carries the build id. REQUIRED — a missing
   * store cannot degrade to "do not cache" without silently reintroducing BUG-01.
   */
  readonly shell: Store;
  readonly routes: Store;
  readonly pages: Store;
  readonly data: Store;
}

export interface RouterConfig {
  readonly table: RouteTable;
  readonly linker: Linker;
  readonly stores: RouterStores;
  readonly resources?: readonly ResourceRule[];
  /**
   * URLs preloaded by `install`, EXACT (never globs). Resolved against `origin` and
   * evaluated BEFORE `resources`: the shell is identity, not class. Turning these into
   * globs would let one shell entry capture resources that were never precached.
   */
  readonly shell?: readonly string[];
  /**
   * The published runtime, cached AS IT IS ASKED FOR (SDD-45 §4.5.1).
   *
   * A prefix and a store, together, because neither means anything alone. Everything under
   * the prefix is immutable by construction — the URL carries the version — so the policy is
   * `cache-first` with no TTL and the entry is written the first time a page asks for it.
   *
   * **On demand and never up front, and that is the point of the whole SDD.** Precaching the
   * runtime at `install` was the first answer and it was wrong: it turns a framework that is
   * published in pieces back into one download, and the first visit pays for every branch of
   * it — forms, injection, reactivity — to render a page that may use none. A progressive app
   * downloads what the page in front of the user needs; the rest arrives when a page needs
   * it, and then it is there for good.
   *
   * Absent for an application that links no published runtime — dev, or a project without
   * one — and then nothing here changes.
   */
  readonly runtime?: { readonly prefix: string; readonly store: Store };
  /** Injected for tests; defaults to 128 random bits per response. */
  readonly nonce?: () => string;
  /** Base for resolving manifest paths. Defaults to the SW's own location. */
  readonly origin?: string;
  /** The rescue network (§4.13). Injected so the fallback path is testable. */
  readonly net?: (request: Request) => Promise<Response>;
  readonly onError?: (pathname: string, error: unknown) => void;
  /** Out-of-band signal that a route could not be linked (§4.13). */
  readonly onDead?: (pattern: string) => void;
}

export interface Router {
  /** SYNCHRONOUS decision; calls `respondWith` only when it will serve (§4.4.2). */
  handle(event: FetchEvent): void;
  /**
   * The same decision, as a Response — for a caller that has ALREADY taken the request
   * (BUG-31 §T7). A worker the browser just woke has no router yet, so its fetch listener
   * cannot decide synchronously; what it can do is take the navigation, await the boot and
   * ask here. What this router would have declined becomes the network, which is what
   * declining meant in the first place.
   */
  respond(event: FetchEvent): Promise<Response>;
  /** Warm a template: chunk + deps into `routes-<build>`. Idempotent. */
  warm(pathname: string): Promise<void>;
  /**
   * Warm the hydration chunks of these component tags (SDD-17 §4.7): each tag's chunk AND
   * what that chunk imports. Returns the tags fully in cache — the page reports
   * `fud:warmed` for those and only those.
   */
  warmHydration(tags: readonly string[]): Promise<readonly string[]>;
  /**
   * Keep the pieces a page reports having used (SDD-45 §4.5.1). Idempotent, and a no-op for
   * an application that links no published runtime.
   *
   * It is a KEEP and not a warm: the page already downloaded these, so what happens here is
   * a read of the browser's own HTTP cache into the origin's runtime cache. What it buys is
   * the one load a worker cannot intercept — its own first one.
   */
  keepRuntime(urls: readonly string[]): Promise<void>;
  /** Seed the in-memory page index from the cache. Awaited before wiring `fetch`. */
  ready(): Promise<void>;
  /** Drop a concrete route's cached page and data. */
  invalidate(pathname: string): Promise<void>;
}

const HTML_HEADERS = { 'content-type': 'text/html; charset=utf-8' };

/** `/assets/**` → matches `/assets/a/b.png`; `*` does not cross a `/`. */
function globMatches(pattern: string, pathname: string): boolean {
  const source = pattern
    .split('**')
    .map((part) =>
      part
        .split('*')
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/gu, '\\$&'))
        .join('[^/]*'),
    )
    .join('.*');
  return new RegExp(`^${source}$`, 'u').test(pathname);
}

function defaultOrigin(): string {
  return typeof location === 'undefined' ? 'http://fudic.invalid/' : location.href;
}

export function createRouter(config: RouterConfig): Router {
  const { table, linker, stores } = config;
  const nonceOf = config.nonce ?? newNonce;
  const net = config.net ?? ((request: Request): Promise<Response> => fetch(request));
  const base = config.origin ?? defaultOrigin();
  const abs = (path: string): string => new URL(path, base).href;

  /** Templates whose chunk + deps are known to be in `routes-<build>`. */
  const warmed = new Set<string>();
  /** Concrete page URLs known to be in `pages-<build>`. In memory: the decision is sync. */
  const pages = new Set<string>();
  /** Patterns that failed to link; not retried until the SW restarts (§4.13). */
  const dead = new Set<string>();
  /**
   * What `install` precached, absolutized once: the resource decision is synchronous
   * and on the hot path, so it must be a lookup, not a loop over globs.
   */
  const shellUrls = new Set<string>((config.shell ?? []).map(abs));

  /**
   * The key of the page cache is the URL THE USER VISITS — the only one the fetch
   * handler has in front of it when it decides. It used to be derived from the record's
   * prerendered-HTML template, which is what turned `pages` into a document cache
   * (BUG-02 §4.4).
   */
  const pageUrlOf = (pathname: string): string => abs(pathname);

  /**
   * Serve a page this Service Worker rendered earlier (`page.cache: 'persist'`).
   *
   * Nothing enters `pages` by download; what is there was produced by `render` and
   * carries `NONCE_TOKEN`, not a literal nonce — a reused nonce is not a nonce. So the
   * substitution happens HERE, with the nonce of THIS response (§4.5).
   */
  const servePage = async (url: string, nonce: string, request: Request): Promise<Response> => {
    const cached = await stores.pages.match(url);
    if (cached === undefined) {
      pages.delete(url);
      return net(request); // evicted between the decision and here
    }
    const headers = new Headers(HTML_HEADERS);
    headers.set('content-security-policy', cspFor(table.csp.document, nonce));
    return new Response(applyNonce(await cached.text(), nonce), { headers });
  };

  /**
   * What the route resolved for this render: `data`, and the layout props beside it.
   *
   * ONE request, because they come out of one instant of one request (SDD-40 §3.3). The SW
   * executes neither `load` nor `layout` and that is not a gap: `@server` cannot reach a
   * client bundle, where there are keys and data access (BUG-09).
   */
  const fetchData = async (
    record: RouteRecord,
    params: Readonly<Record<string, string>>,
  ): Promise<{ data: unknown; layout?: unknown }> => {
    // `dataPolicy` IS the "this route resolves something" signal: it is emitted exactly when
    // the page declares `@server load` or `@server layout`. One question, one branch.
    const { dataPolicy } = record;
    if (dataPolicy === undefined) {
      return { data: {} };
    }
    const response = await stores.data.get(
      abs(fillParams(table.urls.dataUrl(record.pattern), params)),
      dataPolicy.policy,
      dataPolicy.ttl,
    );
    return (await response.json()) as { data: unknown; layout?: unknown };
  };

  /** The render itself: link → data → `chunk.render(ctx)` → `Response`. */
  const render = async (
    record: RouteRecord,
    chunkUrl: string,
    params: Readonly<Record<string, string>>,
    url: URL,
    nonce: string,
    request: Request,
  ): Promise<Response> => {
    try {
      const exports = await linker.link(
        abs(chunkUrl),
        (record.deps ?? []).map((name) => abs(table.urls.depUrl(name))),
      );
      const chunk = exports as unknown as RouteChunk;
      const { data, layout } = await fetchData(record, params);
      // The chunk renders with the TOKEN, not with this response's nonce: the same bytes
      // may be persisted and served again, and a nonce is per response (§4.5).
      const ctx: RenderContext = {
        origin: 'sw',
        url,
        params,
        mode: record.mode,
        nonce: NONCE_TOKEN,
        data,
        // Omitted rather than set to `undefined`: a route whose layout declares only props
        // with defaults resolves none, and `exactOptionalPropertyTypes` makes the two
        // different things.
        ...(layout === undefined ? {} : { layout }),
      };
      const headers = new Headers(HTML_HEADERS);
      headers.set('content-security-policy', cspFor(table.csp.document, nonce));
      let stream = chunk.render(ctx);
      if (record.page?.cache === 'persist') {
        // The surviving shape of SDD-19's incremental mode: render once per concrete
        // URL and keep the HTML. Opt-in, and its TTL is the data's — never a second one.
        const pageUrl = pageUrlOf(url.pathname);
        const [toResponse, toCache] = stream.tee();
        stream = toResponse;
        void stores.pages
          .put(pageUrl, new Response(toCache, { headers: HTML_HEADERS }))
          .then(() => {
            pages.add(pageUrl);
          })
          .catch(() => undefined);
      }
      return new Response(applyNonceStream(stream, nonce), { headers });
    } catch (error) {
      // The one exception to "respondWith only when rendering": we WERE going to
      // render, so this is a single rescue request, not a duplicated one.
      config.onError?.(url.pathname, error);
      dead.add(record.pattern);
      config.onDead?.(record.pattern);
      const rescued = await net(request);
      const headers = new Headers(rescued.headers);
      headers.set('x-fudic-fallback', 'link-error');
      return new Response(rescued.body, { status: rescued.status, headers });
    }
  };

  /**
   * Non-navigation requests: the shell first, then the `sw.json` resource classes,
   * never blindly.
   *
   * The order is fixed and it matters. What `install` precached is served BY IDENTITY
   * from its own cache; only then do the classes get a turn. A `/assets/**` rule that
   * also matched a shell entry would serve it from `data-<build>` and leave the
   * precached copy unread forever — which is exactly the bug (BUG-01 §4.1).
   */
  /** The class a path belongs to, or `null` when no rule claims it. */
  const ruleFor = (pathname: string): ResourceRule | null => {
    for (const rule of config.resources ?? []) {
      if (globMatches(rule.pattern, pathname)) {
        return rule;
      }
    }
    return null;
  };

  const handleResource = (event: FetchEvent, url: URL): void => {
    // The published runtime, first and by PREFIX (SDD-45 §4.5.1). Before the classes because
    // a `/_fudic/**` written by hand in `sw.json` would send these to `data-<app>-<build>`,
    // which is purged on every deploy — and the one property this cache has is that it is
    // not. Cache-first with no TTL: the version is in the URL, so the bytes behind it never
    // change, and the entry is written the first time a page asks for it and not before.
    const runtime = config.runtime;
    if (runtime !== undefined && url.pathname.startsWith(runtime.prefix)) {
      event.respondWith(runtime.store.get(event.request, 'cache-first', null));
      return;
    }
    if (shellUrls.has(url.href)) {
      // One policy, not configurable: the cache name carries the build id, so within a
      // build the shell cannot go stale. A TTL here would be a second expiry mechanism
      // for something that already expires (§4.2).
      event.respondWith(stores.shell.get(event.request, 'cache-first', null));
      return;
    }
    const rule = ruleFor(url.pathname);
    if (rule !== null) {
      event.respondWith(
        (async (): Promise<Response> => {
          const response = await stores.data.get(event.request, rule.policy, rule.ttl);
          if (rule.maxEntries !== undefined) {
            void stores.data.prune(rule.maxEntries);
          }
          return response;
        })(),
      );
    }
  };

  /**
   * Warm a template: its deps in topological order, then its chunk, into
   * `routes-<build>`. Chunks and nothing else — the SW does not download documents
   * (BUG-02 §4.3). It asks the record for what it HAS, not for the label it was given:
   * `ssr` is the only mode that is a runtime decision.
   */
  const warm = async (pathname: string): Promise<void> => {
    const hit = table.match(pathname);
    if (hit === null) {
      return;
    }
    const { record } = hit;
    const chunkUrl = table.urls.renderUrl(record);
    if (record.mode !== 'ssr' && chunkUrl !== null && !warmed.has(record.pattern)) {
      for (const dep of record.deps ?? []) {
        await stores.routes.get(abs(table.urls.depUrl(dep)), 'cache-first', null);
      }
      await stores.routes.get(abs(chunkUrl), 'cache-first', null);
      warmed.add(record.pattern);
    }
  };

  /**
   * Deposit ONE file, in the store the fetch handler will read it from — and that is the
   * whole design: a warm that wrote anywhere else would be a cache nobody reads, which is
   * BUG-01 again. So a URL no resource class claims is NOT warmed; the router would not
   * serve it either, and precaching it would be pure waste.
   *
   * `cache-first` with no TTL, and not the class's own policy: the point of the deposit is
   * to AVOID network later, and a `network-first` class would re-download on every order.
   * That read is also the second layer of the idempotence of §4.7 — the page holds the
   * first — so a repeated order costs one `cache.match` and nothing else. `priority: 'low'`
   * keeps the download off the critical path, which is what makes warm free.
   */
  /** Whether a path belongs to the PUBLISHED runtime this worker serves by prefix. */
  const isRuntimePiece = (pathname: string): boolean =>
    config.runtime !== undefined && pathname.startsWith(config.runtime.prefix);

  /** The deposited body, when it landed with a 200; `null` otherwise. */
  const deposit = async (url: string): Promise<Response | null> => {
    const absolute = abs(url);
    const pathname = new URL(absolute).pathname;
    // A piece of the PUBLISHED runtime goes where `handleResource` reads it from: the shared
    // runtime cache, which no `sw.json` class claims (SDD-45 §4.5.1). Declining it here, as a
    // URL nobody serves, left the gesture paying the network for the very imports of the
    // chunk the warm had just deposited.
    const store = isRuntimePiece(pathname)
      ? config.runtime!.store
      : ruleFor(pathname) === null
        ? null
        : stores.data;
    if (store === null) {
      return null;
    }
    try {
      // Only a 200 is stored (`Store` refuses the rest), so only a 200 may be reported: a
      // page told a chunk is warm and then paying network for it would be worse than never
      // having been told.
      const response = await store.get(
        new Request(absolute, { priority: 'low' }),
        'cache-first',
        null,
      );
      return response.status === 200 ? response : null;
    } catch {
      // Warm is an optimization: a chunk that did not land is downloaded on demand, inside
      // the gesture, exactly as if warm had never existed.
      return null;
    }
  };

  /**
   * The published runtime pieces a module imports STATICALLY, read off its own bytes.
   *
   * The manifest cannot name them: it lists what THIS build emitted, and the runtime is
   * published apart, under a version and not a build (SDD-45). But the worker holds the bytes
   * of every file it deposits, and a static import is written in them — `from"/_fudic/…"` —
   * so the graph is read where it is. Dynamic `import()` is left alone on purpose: what a piece
   * loads on demand is that piece's own decision, and warming it would be guessing.
   */
  const runtimeImportsOf = async (response: Response, base: string): Promise<string[]> => {
    const text = await response.clone().text();
    const found: string[] = [];
    for (const match of text.matchAll(/(?:\bfrom|\bimport)\s*["']([^"']+)["']/gu)) {
      const url = new URL(match[1]!, base);
      if (isRuntimePiece(url.pathname)) found.push(url.href);
    }
    return found;
  };

  /**
   * Warm the hydration chunks of these tags (SDD-17 §4.7).
   *
   * **The chunk AND what it imports.** The page orders by TAG and knows nothing else: the
   * URL of a tag's chunk is arithmetic, but the shared code the client pass extracts keeps
   * a content hash and is therefore a fact of the build — which is why the manifest carries
   * it and this is the side that reads it. Warming the tag's chunk alone left its imports
   * to the network INSIDE the gesture, measured at ~12 ms on localhost, and that is the one
   * place warm exists to keep clear.
   *
   * A tag counts as warmed only when every one of its files landed: half a graph in cache
   * still pays network on the first interaction.
   *
   * **And the published runtime those files import**, transitively (SDD-45 §4.3: the pieces
   * a component needs come «with the warm, in the same batch»). Read off the deposited bytes,
   * because the manifest does not know them; a piece that fails to land still counts against
   * the tag, for the same reason a chunk does.
   */
  const warmHydration = async (tags: readonly string[]): Promise<readonly string[]> => {
    const warmedTags: string[] = [];
    for (const tag of tags) {
      let complete = true;
      const pending = [table.urls.hydrateUrl(tag), ...table.hydrateDeps(tag)];
      const seen = new Set<string>();
      while (pending.length > 0) {
        const url = abs(pending.shift()!);
        if (seen.has(url)) continue;
        seen.add(url);
        const response = await deposit(url);
        if (response === null) {
          complete = false;
          continue;
        }
        pending.push(...(await runtimeImportsOf(response, url)));
      }
      if (complete) {
        warmedTags.push(tag);
      }
    }
    return warmedTags;
  };

  /**
   * The decision itself: the Response this router would serve, or `null` for «not ours, let
   * the network have it». Every `return null` below is a request this worker declines.
   *
   * Split out of `handle` so a COLD worker can reach it too (BUG-31 §T7): `handle` keeps the
   * synchronous contract of §4.4.2 — it calls `respondWith` only when it will serve — while
   * `respond` gives the same answer to a caller that has already taken the request and can
   * fall back to the network itself.
   */
  const decide = (event: FetchEvent, url: URL): Promise<Response> | null => {
    const request = event.request;
    if (request.method !== 'GET' || request.mode !== 'navigate') {
      return null;
    }
    const hit = table.match(url.pathname);
    if (hit === null) {
      return null; // not ours
    }
    const { record, params } = hit;
    if (record.mode === 'ssr' || dead.has(record.pattern)) {
      return null; // always the server; its chunk is never even downloaded
    }

    const nonce = nonceOf();
    const pageUrl = pageUrlOf(url.pathname);
    if (pages.has(pageUrl)) {
      return servePage(pageUrl, nonce, request);
    }
    // Capability, not label: a record with no chunk cannot be rendered here, whatever
    // its mode says. That is also what removes the `record.chunk!` assertion (§4.6.3).
    const chunkUrl = table.urls.renderUrl(record);
    if (chunkUrl === null || !warmed.has(record.pattern)) {
      // Cold: the network serves this one and the template warms behind it.
      event.waitUntil(warm(url.pathname));
      return null;
    }
    return render(record, chunkUrl, params, url, nonce, request);
  };

  return {
    handle(event: FetchEvent): void {
      const url = new URL(event.request.url);
      if (event.request.method === 'GET' && event.request.mode !== 'navigate') {
        handleResource(event, url);
        return;
      }
      const response = decide(event, url);
      if (response !== null) event.respondWith(response);
    },

    respond(event: FetchEvent): Promise<Response> {
      const url = new URL(event.request.url);
      return decide(event, url) ?? net(event.request);
    },

    warm,

    warmHydration,

    async keepRuntime(urls: readonly string[]): Promise<void> {
      const runtime = config.runtime;
      if (runtime === undefined) return;
      for (const url of urls) {
        // The page's word is checked, not taken: a message can name any URL, and what this
        // worker writes into the origin's shared cache must be a piece of the published
        // runtime and nothing else.
        const absolute = abs(url);
        if (!new URL(absolute).pathname.startsWith(runtime.prefix)) continue;
        try {
          await runtime.store.get(
            new Request(absolute, { priority: 'low' }),
            'cache-first',
            null,
          );
        } catch {
          // Keeping is an optimisation: a piece that did not land is fetched on demand, the
          // same way it would have been if this notice had never arrived.
        }
      }
    },

    async ready(): Promise<void> {
      for (const url of await stores.pages.keys()) {
        pages.add(url);
      }
      // And the same for the TEMPLATES (BUG-31 §T7). `warmed` is an index of what is in
      // `routes-<build>`, not a record of what this worker session did — and it used to be
      // rebuilt only by warming, so every restart began believing nothing was cached. The
      // first navigation to each route then took the «cold» branch, went to the network and
      // warmed behind itself: online that is invisible, offline it is a failed page for a
      // template that was sitting in the cache all along.
      //
      // The cache is the truth; this Set is only the synchronous lookup the fetch handler
      // needs (§4.4.2). Read once, here, where `pages` is already read.
      const cached = new Set(await stores.routes.keys());
      for (const record of table.records()) {
        const chunkUrl = table.urls.renderUrl(record);
        if (chunkUrl === null || !cached.has(abs(chunkUrl))) continue;
        // Its deps too: half a graph in cache is a link that pays network anyway.
        if ((record.deps ?? []).every((dep) => cached.has(abs(table.urls.depUrl(dep))))) {
          warmed.add(record.pattern);
        }
      }
    },

    async invalidate(pathname: string): Promise<void> {
      const hit = table.match(pathname);
      if (hit === null) {
        return;
      }
      const pageUrl = pageUrlOf(pathname);
      pages.delete(pageUrl);
      await stores.pages.delete(pageUrl);
      if (hit.record.dataPolicy !== undefined) {
        await stores.data.delete(
          abs(fillParams(table.urls.dataUrl(hit.record.pattern), hit.params)),
        );
      }
    },
  };
}
