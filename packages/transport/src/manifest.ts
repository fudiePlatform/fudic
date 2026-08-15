/**
 * The manifest — the contract between compiler, server and Service Worker
 * (SDD-20 §4.2). The plugin emits it; the server and the SW read it. NOBODY else
 * writes routes.
 *
 * Two properties drive the shape:
 *  - `match` must be SYNCHRONOUS, because `respondWith()` can only be called during
 *    the fetch dispatch (§4.4.1). So the file is compiled once into a `RouteTable`
 *    that lives in the SW's memory, and re-hydrated from its own cache — never the
 *    network — after a recycle.
 *  - `deps` is TOPOLOGICAL, because the linker's `require()` is synchronous: the SW
 *    has to know what to load before what without parsing the source (§4.3).
 */

import { createUrlResolver, type UrlResolver } from './urls.js';

/**
 * What the BUILD decided. Only one of the three is a runtime decision for the SW:
 *
 *  - `ssr` the server, always. The SW does not intercept and does not download its chunk.
 *  - `ssg` the build wrote HTML for a cold start. In the SW it behaves exactly like `sw`.
 *  - `sw`  no prerendered HTML. Nothing else changes.
 *
 * So for the fetch handler the partition is `ssr` against EVERYTHING ELSE (BUG-02 §3.2).
 * `ssg` keeps its meaning in the build (prerender) and loses it in the client.
 */
export type RouteMode = 'ssr' | 'ssg' | 'sw';

export type CachePolicy =
  | 'cache-first'
  | 'network-first'
  | 'stale-while-revalidate'
  | 'network-only';

/** Policy for a route's DATA. Only data has a TTL: it is the only thing that ages. */
export interface DataPolicy {
  readonly policy: CachePolicy;
  readonly ttl: number | null; // ms; null = no expiry
}

/** Persistence of a `sw` route's HTML. Default is NOT to persist (§4.4.4). */
export interface PagePolicy {
  readonly cache: 'never' | 'persist';
  /** ms. With `persist` it is the DATA's ttl: a route never has two TTLs. */
  readonly ttl: number | null;
}

/**
 * A filesystem-safe chunk base name from a route pattern: `/blog/:slug` → `blog-slug`,
 * `/` → `index`.
 *
 * It lives HERE, not in the build, because both sides need it and they must agree. The
 * build names the route's chunk with it; the runtime derives that name back from the
 * pattern (SDD-27 §5.4). Two copies of this function would drift without a single test
 * failing — the files would exist and nobody would ask for them.
 */
export function safeName(pattern: string): string {
  const s = pattern.replace(/[^a-z0-9]+/giu, '-').replace(/^-+|-+$/gu, '');
  return s.length > 0 ? s : 'index';
}

/**
 * One route. Note what is NOT here: URLs.
 *
 * Not the URL of a prerendered HTML file — that is a file of the EDGE, whose whole job is
 * the first visit (TTFB, SEO, no-JS); whoever serves it locates it by convention, never
 * through this contract. Naming it here turned the router into a per-route document cache
 * and switched the render off (BUG-02 §3.1).
 *
 * And not the URL of any chunk either (SDD-27 §5.4). Chunk names are derivable from the
 * pattern and the tag, and they carry the build id rather than a content hash, so the only
 * thing a record has to state is WHICH components the route needs. `UrlResolver` does the
 * rest, in one place.
 */
export interface RouteRecord {
  readonly pattern: string;
  readonly mode: RouteMode;
  /**
   * Component chunk NAMES — no directory, no hash, no extension — in TOPOLOGICAL order,
   * because the linker's `require` is synchronous and must load what comes first, first.
   *
   * Its PRESENCE is the capability signal: a record with `deps` is one the Service Worker
   * can render, whatever its `mode` says; a record without it is a route only the server
   * can serve. An enumerated `ssg` route is exactly that case — it is prerendered, so its
   * mode is not `ssr`, but the SW does not carry the enumeration and must not render an
   * id that `paths()` never listed. An empty list is a renderable route with no
   * components, which is a different thing from an absent one.
   */
  readonly deps?: readonly string[];
  /** Present exactly when the route declares `@server load`, and thus has a data endpoint. */
  readonly dataPolicy?: DataPolicy;
  readonly page?: PagePolicy;
}

export interface CspTemplates {
  /** Document CSP; carries the `{nonce}` token (§4.9). */
  readonly document: string;
  /** CSP of the Service Worker script. Carries `'unsafe-eval'`, never a nonce. */
  readonly sw: string;
}

export interface ManifestFile {
  readonly build: string;
  /**
   * The app's public base path (Vite's `base`). It used to be baked into every URL of
   * every record; now that the records carry names instead, it is stated once and the
   * resolver applies it.
   */
  readonly base: string;
  readonly csp: CspTemplates;
  /** Ordered by DESCENDING specificity: `match` returns the FIRST hit. */
  readonly routes: readonly RouteRecord[];
  /**
   * Component tag → the chunks its hydration chunk statically imports, transitively
   * (SDD-17 §4.7). Paths as the build named them, `base` excluded like everywhere here.
   *
   * It is the ONE thing about a hydration chunk that is not derivable: the shared code
   * the client pass extracts keeps a content hash. Without it a warm deposits the tag's
   * chunk and leaves its imports to the network — inside the gesture, which is the one
   * place warm exists to keep clear. It lives in the MANIFEST and not in the page (§4.6):
   * both are purged by the same build id, while a prerendered HTML outlives its build.
   */
  readonly hydrate?: Readonly<Record<string, readonly string[]>>;
}

export interface RouteMatch {
  readonly record: RouteRecord;
  readonly params: Readonly<Record<string, string>>;
}

/** The compiled, synchronous view of the manifest. Lives in the SW's memory. */
export interface RouteTable {
  readonly build: string;
  readonly csp: CspTemplates;
  /** Record → URLs. The only implementation of that arithmetic (SDD-27 §5.4). */
  readonly urls: UrlResolver;
  match(pathname: string): RouteMatch | null;
  /** The `sw` template that owns `pathname` — the unit of warming is the TEMPLATE. */
  templateOf(pathname: string): RouteRecord | null;
  /**
   * The URLs a tag's hydration chunk imports, `base` applied. Empty for a tag with no
   * shared code, and empty for a tag this build does not know — a warm asks for what a
   * page says it has, and an unknown tag is a stale page, not an error.
   */
  hydrateDeps(tag: string): readonly string[];
}

interface CompiledRoute {
  readonly segments: readonly string[];
  readonly record: RouteRecord;
}

/** Path segments, query stripped, empty ones dropped. `/` → `[]`. */
export function segmentsOf(path: string): string[] {
  // `indexOf` rather than `split(...)[0]`: an index access under
  // `noUncheckedIndexedAccess` needs a fallback for a case `split` cannot produce, and an
  // unreachable fallback is a branch no test can ever cover.
  const query = path.indexOf('?');
  const pathname = query === -1 ? path : path.slice(0, query);
  return pathname.split('/').filter((s) => s.length > 0);
}

/** Fill `:param` placeholders of a URL template. Values are percent-encoded. */
export function fillParams(template: string, params: Readonly<Record<string, string>>): string {
  return template
    .split('/')
    .map((seg) => {
      if (!seg.startsWith(':')) {
        return seg;
      }
      const value = params[seg.slice(1)];
      return value === undefined ? seg : encodeURIComponent(value);
    })
    .join('/');
}

/** Match one compiled pattern against concrete parts, collecting params. */
function matchSegments(
  pattern: readonly string[],
  parts: readonly string[],
): Record<string, string> | null {
  if (pattern.length !== parts.length) {
    return null;
  }
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i += 1) {
    const seg = pattern[i]!;
    const part = parts[i]!;
    if (seg.startsWith(':')) {
      params[seg.slice(1)] = decodeURIComponent(part);
      continue;
    }
    if (seg !== part) {
      return null;
    }
  }
  return params;
}

/** Pure and synchronous: the file becomes a table the fetch handler can query. */
export function compileManifest(file: ManifestFile): RouteTable {
  const compiled: CompiledRoute[] = file.routes.map((record) => ({
    segments: segmentsOf(record.pattern),
    record,
  }));
  const match = (pathname: string): RouteMatch | null => {
    const parts = segmentsOf(pathname);
    for (const route of compiled) {
      const params = matchSegments(route.segments, parts);
      if (params !== null) {
        return { record: route.record, params };
      }
    }
    return null;
  };
  const urls = createUrlResolver(file.base, file.build);
  return {
    build: file.build,
    csp: file.csp,
    urls,
    match,
    templateOf(pathname: string): RouteRecord | null {
      const hit = match(pathname);
      return hit !== null && hit.record.mode === 'sw' ? hit.record : null;
    },
    hydrateDeps(tag: string): readonly string[] {
      return (file.hydrate?.[tag] ?? []).map((path) => urls.assetUrl(path));
    },
  };
}

/**
 * Read the manifest from the SHELL CACHE — no network. It entered there with the
 * `install` precache, and a recycled SW rehydrates from it before the first
 * navigation it can serve (§4.4.1). Rejects when it is not cached: the caller then
 * simply does not intercept.
 */
export async function loadManifest(url: string, cache: Cache): Promise<RouteTable> {
  // `ignoreVary` for the reason of BUG-04 §2.4.1, and it is not a degraded failure: the
  // manifest is a SERVABLE shell entry, so a document can rewrite its key by asking for
  // it. A miss here throws, `boot()` gives up, the router never becomes ready and the
  // Service Worker stops intercepting altogether — silently, until the next build.
  const response = await cache.match(url, { ignoreVary: true });
  if (response === undefined) {
    throw new Error(`fudic: manifest not in cache (${url})`);
  }
  return compileManifest((await response.json()) as ManifestFile);
}
