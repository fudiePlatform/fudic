/**
 * Manifest assembly (SDD-19 §4.7): turn the ordered `RouteBuild` list into the
 * `route→chunk` manifest file `@fudic/transport` loads (single source, matched
 * first-hit by specificity, which the route order already encodes).
 *
 * Each non-excluded route becomes a record carrying the mode's `dynamic` flag: an
 * incremental route (`dynamic:true`) the SW renders via the WW and caches; a prerendered
 * static route (`dynamic:false`) the SW ignores, so the browser fetches the emitted
 * `.html` directly (§4.4). The `chunk` URL rides along either way (unused when static).
 */

import { type RouteRecord, type RouteManifestFile } from '@fudic/transport';
import { type RouteBuild } from './discover.js';

/** Build the manifest file from routes and a `chunkOf` that yields each route's chunk URL. */
export function buildManifest(
  routes: readonly RouteBuild[],
  chunkOf: (route: RouteBuild) => string,
): RouteManifestFile {
  const records: RouteRecord[] = [];
  for (const rb of routes) {
    if (rb.decision.mode === 'excluded') {
      continue;
    }
    records.push({ pattern: rb.route.pattern, dynamic: rb.decision.dynamic, chunk: chunkOf(rb) });
  }
  return records;
}
