/**
 * The single route→chunk source (SDD-16 §4.5). SW and WW load the SAME manifest
 * from the same ABSOLUTE url, versioned with the build — if they disagreed on
 * which chunk owns which route, every navigation would serve the wrong HTML.
 * The manifest is consumed here; the emit/build (SDD-15) produces it.
 */

export interface ManifestEntry {
  readonly dynamic: boolean; // SW: delegate to the WW, or static/cache?
  readonly chunk: string;    // WW: what to import() (resolved against the worker script URL)
}

export interface RouteManifest {
  match(route: string): ManifestEntry | null;
}

/** Load from an ABSOLUTE url so SW and WW never drift. */
export async function loadManifest(url: string): Promise<RouteManifest> {
  const response = await fetch(url);
  const routes = (await response.json()) as Record<string, ManifestEntry>;
  return {
    match(route: string): ManifestEntry | null {
      return routes[route] ?? null;
    },
  };
}
