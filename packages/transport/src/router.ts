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
}

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
  /** Warm a template: chunk + deps into `routes-<build>`. Idempotent. */
  warm(pathname: string): Promise<void>;
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

  const fetchData = async (record: RouteRecord, params: Readonly<Record<string, string>>): Promise<unknown> => {
    // `dataPolicy` IS the "this route has data" signal now: it is emitted exactly when the
    // page declares `@server load`. One question, one branch.
    const { dataPolicy } = record;
    if (dataPolicy === undefined) {
      return {};
    }
    const response = await stores.data.get(
      abs(fillParams(table.urls.dataUrl(record.pattern), params)),
      dataPolicy.policy,
      dataPolicy.ttl,
    );
    return response.json();
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
      const data = await fetchData(record, params);
      // The chunk renders with the TOKEN, not with this response's nonce: the same bytes
      // may be persisted and served again, and a nonce is per response (§4.5).
      const ctx: RenderContext = { origin: 'sw', url, params, mode: record.mode, nonce: NONCE_TOKEN, data };
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
  const handleResource = (event: FetchEvent, url: URL): void => {
    if (shellUrls.has(url.href)) {
      // One policy, not configurable: the cache name carries the build id, so within a
      // build the shell cannot go stale. A TTL here would be a second expiry mechanism
      // for something that already expires (§4.2).
      event.respondWith(stores.shell.get(event.request, 'cache-first', null));
      return;
    }
    for (const rule of config.resources ?? []) {
      if (globMatches(rule.pattern, url.pathname)) {
        event.respondWith(
          (async (): Promise<Response> => {
            const response = await stores.data.get(event.request, rule.policy, rule.ttl);
            if (rule.maxEntries !== undefined) {
              void stores.data.prune(rule.maxEntries);
            }
            return response;
          })(),
        );
        return;
      }
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

  return {
    handle(event: FetchEvent): void {
      const request = event.request;
      const url = new URL(request.url);
      if (request.method !== 'GET') {
        return;
      }
      if (request.mode !== 'navigate') {
        handleResource(event, url);
        return;
      }
      const hit = table.match(url.pathname);
      if (hit === null) {
        return; // not ours
      }
      const { record, params } = hit;
      if (record.mode === 'ssr' || dead.has(record.pattern)) {
        return; // always the server; its chunk is never even downloaded
      }

      const nonce = nonceOf();
      const pageUrl = pageUrlOf(url.pathname);
      if (pages.has(pageUrl)) {
        event.respondWith(servePage(pageUrl, nonce, request));
        return;
      }
      // Capability, not label: a record with no chunk cannot be rendered here, whatever
      // its mode says. That is also what removes the `record.chunk!` assertion (§4.6.3).
      const chunkUrl = table.urls.renderUrl(record);
      if (chunkUrl === null || !warmed.has(record.pattern)) {
        // Cold: the network serves this one and the template warms behind it.
        event.waitUntil(warm(url.pathname));
        return;
      }
      event.respondWith(render(record, chunkUrl, params, url, nonce, request));
    },

    warm,

    async ready(): Promise<void> {
      for (const url of await stores.pages.keys()) {
        pages.add(url);
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
