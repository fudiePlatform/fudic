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

export interface RouteRecord {
  readonly pattern: string;
  readonly mode: RouteMode;
  /** `sw`: absolute URL of the linkable chunk. */
  readonly chunk?: string;
  /** `sw`: absolute URLs of its dependencies, in TOPOLOGICAL order. */
  readonly deps?: readonly string[];
  /** `sw`: data endpoint template, `:param` placeholders included. */
  readonly data?: string;
  readonly dataPolicy?: DataPolicy;
  readonly page?: PagePolicy;
  /** `ssg` (or an enumerated `sw` route): URL template of the prerendered HTML. */
  readonly html?: string;
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
  const pathname = path.split('?', 1)[0] ?? path;
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
  const response = await cache.match(url);
  if (response === undefined) {
    throw new Error(`fudic: manifest not in cache (${url})`);
  }
  return compileManifest((await response.json()) as ManifestFile);
}
