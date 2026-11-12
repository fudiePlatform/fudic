/**
 * The pages a `page` header or a URL of a flow can name, read off the routes folder: a page is
 * a `.fud` there, by its path. `index.fud` is the folder's own page, `[slug]` a param, and a file
 * whose name starts with `_` (`_error.fud`) is not a page of its own.
 */

import type { SpecFs } from './catalog.js';

/** A page of the project, by where it sits. */
export interface RouteFile {
  /** As a header writes it: `/`, `/usuarios`, `/blog/[slug]`. */
  readonly route: string;
  /** Absolute path of its `.fud`. */
  readonly path: string;
  /** Its URL pattern: `/blog/:slug`. */
  readonly pattern: string;
  /** The names of its params, in order. */
  readonly params: readonly string[];
}

const PAGE = '.fud';
const INDEX = 'index';
const PARAM = /^\[(.+)\]$/u;

/** Every page under `dir`, the routes folder, in a stable order. */
export function routeFiles(fs: Pick<SpecFs, 'readDirectory'>, dir: string): readonly RouteFile[] {
  const found: RouteFile[] = [];
  const walk = (folder: string, segments: readonly string[]): void => {
    for (const name of [...fs.readDirectory(folder)].sort()) {
      if (name.startsWith('_')) continue;
      if (name.endsWith(PAGE)) found.push(routeOf(`${folder}/${name}`, [...segments, name.slice(0, -PAGE.length)]));
      else walk(`${folder}/${name}`, [...segments, name]);
    }
  };
  walk(dir, []);
  return found;
}

/** A page from its path and its segments under the routes folder, extension dropped. */
function routeOf(path: string, segments: readonly string[]): RouteFile {
  const own = segments.at(-1) === INDEX ? segments.slice(0, -1) : segments;
  const params = own.flatMap((s) => PARAM.exec(s)?.[1] ?? []);
  return {
    route: `/${own.join('/')}`,
    path,
    pattern: `/${own.map((s) => s.replace(PARAM, ':$1')).join('/')}`,
    params,
  };
}

/** The page a header names: by its route, or with its `index` written out (`/blog/index`). */
export function findRoute(routes: readonly RouteFile[], route: string): RouteFile | undefined {
  const own = route.endsWith(`/${INDEX}`) ? route.slice(0, -INDEX.length - 1) || '/' : route;
  return routes.find((r) => r.route === own);
}

/** Whether a URL — its path; the query and the hash do not count — matches a pattern. */
export function matchesPattern(pattern: string, url: string): boolean {
  const path = url.replace(/[?#].*$/su, '');
  const want = pattern.split('/').filter((s) => s !== '');
  const have = path.split('/').filter((s) => s !== '');
  return want.length === have.length && want.every((s, i) => s.startsWith(':') || s === have[i]);
}
