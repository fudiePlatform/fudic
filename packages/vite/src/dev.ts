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
import { DEV_CLIENT_PREFIX } from './constants.js';

/**
 * A dev module with its source map attached inline, ready to be written to the response.
 *
 * The dev server serves `/@fudic/h/*.js`, `fudic-main.js` and the two other bootstraps from a
 * middleware of this plugin's own, because none of them has a file behind it. That middleware
 * gets `{ code, map }` out of `transformRequest` and used to write only the code — and the
 * piece that turns a map into something a browser can read is Vite's own module middleware,
 * which this one goes around. The result was that no `.fud` had a source map in dev at all:
 * DevTools showed the generated module, the `.fud` was in no Sources tree, and there was no
 * line to put a breakpoint on. A `.ts` served the usual way had one; anything of fudic's did
 * not.
 *
 * Inline rather than a `.map` URL: the module is not a file, so there is no second URL to
 * serve it from and no middleware left to answer it.
 *
 * A map with no `mappings` is dropped instead of encoded. That is what a transform that
 * produced nothing to map returns, and a comment pointing at an empty map costs a parse in the
 * browser to describe nothing.
 */
export function withInlineSourceMap(code: string, map: unknown): string {
  const mappings = (map as { mappings?: unknown } | null)?.mappings;
  if (typeof mappings !== 'string' || mappings === '') {
    return code;
  }
  const json = Buffer.from(JSON.stringify(map), 'utf8').toString('base64');
  return `${code}\n//# sourceMappingURL=data:application/json;base64,${json}\n`;
}

/** The Vite dev URL for a virtual-module id: `\0x` is served at `/@id/__x00__x`. */
export function devModuleUrl(base: string, id: string): string {
  return `${base}@id/${id.replace('\0', '__x00__')}`;
}

/** A stable root dev URL (`base + name`), collapsing a double slash when `base` ends in `/`. */
export function devUrl(base: string, name: string): string {
  return `${base}${name}`.replace(/\/{2,}/gu, '/');
}

/**
 * Where the dev server publishes a component's CLIENT module — the answer `resolveChunk`
 * gets in dev (SDD-17 §4.6). Keyed by TAG, which is what the runtime holds.
 */
export function devClientUrl(base: string, tag: string): string {
  return `${devClientPrefix(base)}${tag}.js`;
}

/** What every dev client URL starts with, base included: the bootstrap bakes this in. */
export function devClientPrefix(base: string): string {
  return devUrl(base, DEV_CLIENT_PREFIX);
}

/** The prefix of every dev client URL, base already stripped. */
export const DEV_CLIENT_PATH = `/${DEV_CLIENT_PREFIX}`;

/**
 * The tag a dev client path names, or `null` when the path is not one. The caller has
 * already stripped the site base — the same shape the route matcher works in.
 */
export function devClientTag(path: string): string | null {
  if (!path.startsWith(DEV_CLIENT_PATH) || !path.endsWith('.js')) {
    return null;
  }
  return path.slice(DEV_CLIENT_PATH.length, -'.js'.length);
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
