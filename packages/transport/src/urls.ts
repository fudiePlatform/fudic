/**
 * URL derivation (SDD-27 §5.4) — the one place that turns a manifest record into the
 * URLs of the files it needs.
 *
 * The manifest used to carry those URLs written out, hash included. It does not any more,
 * for one reason: they are DERIVABLE. A route's render chunk is named after its pattern
 * (`safeName`), a component's chunk is named after its tag, and every chunk of the `link`
 * and `client` passes carries the build id instead of a content hash. So a record only has
 * to say WHICH components it needs; WHERE each file lives is arithmetic.
 *
 * The rule that makes this safe is that there is exactly ONE implementation of that
 * arithmetic, and it lives here, in the package both callers already depend on. The build
 * names the files with the same `safeName` this module derives from; the Service Worker
 * and the main thread ask this module. Two implementations would drift silently — the
 * files would be there and nobody would find them.
 */

import { safeName, type RouteRecord } from './manifest.js';

/** Where the generated `@server load` endpoints live (SDD-20 §4.5). */
export const DATA_PREFIX = '_fudic/data';

/** Output directory of the `link` pass: the chunks the Service Worker links by hand. */
export const LINK_DIR = 'sw/c';

/** Output directory of the `client` pass: one hydration chunk per component. */
export const CLIENT_DIR = 'assets/h';

export interface UrlResolver {
  /**
   * The route's own render chunk, or `null` when the Service Worker cannot render this
   * route at all — see `RouteRecord.deps`. A record with no `deps` is not a record with
   * an empty dependency list; it is a route only the server can serve.
   */
  renderUrl(record: RouteRecord): string | null;
  /** A component's render chunk, for the `link` pass. */
  depUrl(name: string): string;
  /** A component's hydration chunk, for the `client` pass. */
  hydrateUrl(name: string): string;
  /**
   * The generated data endpoint of a pattern, `:param` placeholders NOT filled — the
   * caller fills them with `fillParams`, because it is the one holding the match.
   *
   * TOTAL on purpose: whether a route HAS data is `dataPolicy`, and asking two different
   * questions in one call would leave the caller with a branch it can never take.
   */
  dataUrl(pattern: string): string;
}

/**
 * Join `base` with a path, collapsing the double slash a trailing `base` leaves. `base`
 * always ends in `/` — Vite normalizes it — so this only has to fix that one seam.
 */
function join(base: string, path: string): string {
  return `${base}${path}`.replace(/\/{2,}/gu, '/');
}

export function createUrlResolver(base: string, build: string): UrlResolver {
  const chunk = (dir: string, name: string): string => join(base, `${dir}/${name}-${build}.js`);
  return {
    renderUrl(record: RouteRecord): string | null {
      return record.deps === undefined ? null : chunk(LINK_DIR, safeName(record.pattern));
    },
    depUrl(name: string): string {
      return chunk(LINK_DIR, name);
    },
    hydrateUrl(name: string): string {
      return chunk(CLIENT_DIR, name);
    },
    dataUrl(pattern: string): string {
      return join(base, `${DATA_PREFIX}${pattern}`);
    },
  };
}
