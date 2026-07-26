/**
 * Dev-server support (SDD-19 §4.10). In `vite build` the plugin emits hashed chunks and
 * an asset manifest in `generateBundle`; the dev server has neither hook, so this module
 * provides the dev equivalents:
 *
 * - the manifest served from `manifestUrl`, every route `dynamic:true` — mode-1 pages are
 *   rendered on-demand (like incremental) instead of prerendered on every save;
 * - dev URLs: the per-route wrapper as a Vite virtual-module URL (`/@id/__x00__…`) the WW
 *   imports, and the three bootstraps at stable root URLs so the Service Worker registers
 *   at root scope (a SW served from `/@id/…` could only control `/@id/*`).
 */

import { type RouteRecord, type RouteManifestFile } from '@fudic/transport';
import { type RouteBuild } from './discover.js';
import { WRAPPER_PREFIX } from './constants.js';

/** The Vite dev URL for a virtual-module id: `\0x` is served at `/@id/__x00__x`. */
export function devModuleUrl(base: string, id: string): string {
  return `${base}@id/${id.replace('\0', '__x00__')}`;
}

/** A stable root dev URL (`base + name`), collapsing a double slash when `base` ends in `/`. */
export function devUrl(base: string, name: string): string {
  return `${base}${name}`.replace(/\/{2,}/gu, '/');
}

/**
 * The dev manifest: every non-excluded route incremental (`dynamic:true`), its `chunk`
 * the wrapper's dev virtual-module URL. Same shape the WW/SW load in build, unhashed.
 */
export function devManifest(builds: readonly RouteBuild[], base: string): RouteManifestFile {
  const records: RouteRecord[] = [];
  for (const rb of builds) {
    if (rb.decision.mode === 'excluded') {
      continue;
    }
    records.push({
      pattern: rb.route.pattern,
      dynamic: true,
      chunk: devModuleUrl(base, WRAPPER_PREFIX + rb.route.pattern),
    });
  }
  return records;
}
