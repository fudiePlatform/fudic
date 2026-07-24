/**
 * The single route→chunk source (SDD-16 §4.5, extended by SDD-19 §3.4/§4.7). SW
 * and WW load the SAME manifest from the same ABSOLUTE url, versioned with the
 * build — if they disagreed on which chunk owns which route, every navigation
 * would serve the wrong HTML. The manifest is consumed here; the plugin (SDD-19)
 * produces it.
 *
 * SDD-19 turns `match` from an exact lookup into a PATTERN matcher so filesystem
 * routing with params works (`/customer/42` hits `/customer/:id`). The public
 * `ManifestEntry`/`RouteManifest` shapes are unchanged; params never enter the
 * contract — the emitted chunk self-extracts them from the route. What changes is
 * the file format (an ORDERED list, most-specific first) and the algorithm.
 */

export interface ManifestEntry {
  readonly dynamic: boolean; // SW: delegate to the WW, or static/cache?
  readonly chunk: string;    // WW: what to import() (resolved against the worker script URL)
}

/** One published route in the manifest file: a pattern, its mode, its chunk. */
export interface RouteRecord {
  /** Path pattern; a `:name` segment is a param (e.g. `/customer/:id`). */
  readonly pattern: string;
  readonly dynamic: boolean;
  readonly chunk: string;
}

/** The manifest file: ordered by DESCENDING specificity; `match` returns the FIRST hit. */
export type RouteManifestFile = readonly RouteRecord[];

export interface RouteManifest {
  match(route: string): ManifestEntry | null;
}

interface CompiledRoute {
  readonly segments: readonly string[]; // a segment starting with ':' is a param
  readonly entry: ManifestEntry;
}

/** Path segments, query stripped, empty segments dropped. `/` → `[]`. */
function segmentsOf(path: string): string[] {
  const pathname = path.split('?', 1)[0] ?? path;
  return pathname.split('/').filter((s) => s.length > 0);
}

/** A pattern matches a concrete path when every segment lines up (static equal, param any). */
function matches(pattern: readonly string[], parts: readonly string[]): boolean {
  if (pattern.length !== parts.length) {
    return false;
  }
  for (let i = 0; i < pattern.length; i += 1) {
    const seg = pattern[i]!;
    if (seg.startsWith(':')) {
      continue; // param segment: matches any single non-empty part
    }
    if (seg !== parts[i]) {
      return false;
    }
  }
  return true;
}

/** Load from an ABSOLUTE url so SW and WW never drift. */
export async function loadManifest(url: string): Promise<RouteManifest> {
  const response = await fetch(url);
  const file = (await response.json()) as RouteManifestFile;
  const compiled: CompiledRoute[] = file.map((r) => ({
    segments: segmentsOf(r.pattern),
    entry: { dynamic: r.dynamic, chunk: r.chunk },
  }));
  return {
    match(route: string): ManifestEntry | null {
      const parts = segmentsOf(route);
      for (const route_ of compiled) {
        if (matches(route_.segments, parts)) {
          return route_.entry;
        }
      }
      return null;
    },
  };
}
