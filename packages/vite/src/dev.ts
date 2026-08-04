/**
 * Dev-server support (SDD-20 §4.11). In `vite build` the plugin emits hashed chunks and
 * the manifest in `generateBundle`; the dev server has neither hook, so this module
 * provides the dev equivalents.
 *
 * In dev EVERY route is served by the edge: Vite serves ESM untransformed, so there is
 * no linkable chunk to link, and the Service Worker is not registered (option A of
 * §4.11 — what SvelteKit, Next and Nuxt do). The dev manifest therefore declares every
 * route `ssr`: the dev middleware renders them on demand, and nothing is prerendered on
 * every save.
 */

import { type ManifestFile, type RouteRecord, DEFAULT_CSP } from '@fudic/transport';
import { type RouteBuild } from './discover.js';

/** The Vite dev URL for a virtual-module id: `\0x` is served at `/@id/__x00__x`. */
export function devModuleUrl(base: string, id: string): string {
  return `${base}@id/${id.replace('\0', '__x00__')}`;
}

/** A stable root dev URL (`base + name`), collapsing a double slash when `base` ends in `/`. */
export function devUrl(base: string, name: string): string {
  return `${base}${name}`.replace(/\/{2,}/gu, '/');
}

/** The dev manifest: every non-excluded route rendered by the dev server. */
export function devManifest(
  builds: readonly RouteBuild[],
  build = 'dev',
  base = '/',
): ManifestFile {
  const routes: RouteRecord[] = [];
  for (const rb of builds) {
    if (rb.decision.mode === 'excluded') {
      continue;
    }
    routes.push({ pattern: rb.route.pattern, mode: 'ssr' });
  }
  return { build, base, csp: DEFAULT_CSP, routes };
}
