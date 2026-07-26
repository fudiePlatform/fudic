/**
 * Manifest assembly (SDD-19 §4.7): turn the ordered `RouteBuild` list into the
 * `route→chunk` manifest file `@fudic/transport` loads (single source, matched
 * first-hit by specificity, which the route order already encodes).
 *
 * Slice-1: every non-excluded route gets a WW chunk and a `dynamic:true` entry —
 * i.e. incremental (rendered on first hit, then cached). Eager static prerender
 * (mode 1 → an `.html` and `dynamic:false`) is a follow-up; the SW's `tee`+cache
 * already makes incremental behave as static-after-first-hit.
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
    records.push({ pattern: rb.route.pattern, dynamic: true, chunk: chunkOf(rb) });
  }
  return records;
}
