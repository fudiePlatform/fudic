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
 * One route. Note what is NOT here: the URL of a prerendered HTML file.
 *
 * The prerendered document is a file of the EDGE, and its whole job is the first visit —
 * TTFB, SEO, no-JS. Whoever serves it locates it by convention (`htmlPathFor`), never
 * through this contract. Naming it here turned the router into a per-route document
 * cache and switched the render off (BUG-02 §3.1).
 */
export interface RouteRecord {
  readonly pattern: string;
  readonly mode: RouteMode;
  /** Absolute URL of the linkable chunk. Absent: only the server can serve this route. */
  readonly chunk?: string;
  /** Absolute URLs of its dependencies, in TOPOLOGICAL order. */
  readonly deps?: readonly string[];
  /** Data endpoint template, `:param` placeholders included. */
  readonly data?: string;
  readonly dataPolicy?: DataPolicy;
  readonly page?: PagePolicy;
  /** The ESM chunk for the edge (dev/preview/prerender). The SW never reads it. */
  readonly esm?: string;
}

export interface CspTemplates {
  /** Document CSP; carries the `{nonce}` token (§4.9). */
  readonly document: string;
  /** CSP of the Service Worker script. Carries `'unsafe-eval'`, never a nonce. */
  readonly sw: string;
}

export interface ManifestFile {
  readonly build: string;
  readonly csp: CspTemplates;
  /** Ordered by DESCENDING specificity: `match` returns the FIRST hit. */
  readonly routes: readonly RouteRecord[];
}

export interface RouteMatch {
  readonly record: RouteRecord;
  readonly params: Readonly<Record<string, string>>;
}

/** The compiled, synchronous view of the manifest. Lives in the SW's memory. */
export interface RouteTable {
  readonly build: string;
  readonly csp: CspTemplates;
  match(pathname: string): RouteMatch | null;
  /** The `sw` template that owns `pathname` — the unit of warming is the TEMPLATE. */
  templateOf(pathname: string): RouteRecord | null;
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
  return {
    build: file.build,
    csp: file.csp,
    match,
    templateOf(pathname: string): RouteRecord | null {
      const hit = match(pathname);
      return hit !== null && hit.record.mode === 'sw' ? hit.record : null;
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
