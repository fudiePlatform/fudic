/**
 * Plugin options and their resolution (SDD-19 §3.2). The user declares a small,
 * declarative config (the "JSON"); the mode of each route is inferred, not declared
 * here. `outDir`/`base` are NOT options — they come from Vite's config (single
 * source). Defaults are filled and `manifestUrl` is validated absolute (FUD0365):
 * SW and WW must load the SAME url, so a relative one would drift.
 */

import { type FudicDiagnostic, FUD_MANIFEST_URL_NOT_ABSOLUTE } from './diagnostics.js';
import { type ModeOverride, type ParamFallback } from './mode.js';

/** A per-route override keyed by route pattern in `FudicOptions.routes`. */
export interface RouteOverride {
  readonly mode: ModeOverride;
}

export interface FudicOptions {
  /** Directory of page `.fud` files, relative to project root. Default: `'routes'`. */
  readonly routesDir?: string;
  /** Absolute URL where the route manifest is published. Default: `${base}fudic-routes.json`. */
  readonly manifestUrl?: string;
  /** Global default for eager prerender of static routes. Default: `true`. */
  readonly prerender?: boolean;
  /** A dynamic segment absent from `paths()`: render lazily or 404. Default: `'lazy'`. */
  readonly paramFallback?: ParamFallback;
  /** Per-route overrides keyed by route pattern (e.g. `'/admin'`). */
  readonly routes?: Readonly<Record<string, RouteOverride>>;
}

export interface ResolvedOptions {
  readonly routesDir: string;
  readonly base: string;
  readonly manifestUrl: string;
  readonly prerender: boolean;
  readonly paramFallback: ParamFallback;
  readonly routes: Readonly<Record<string, RouteOverride>>;
}

export interface ResolveOptionsResult {
  readonly options: ResolvedOptions;
  readonly diagnostics: readonly FudicDiagnostic[];
}

const DEFAULT_ROUTES_DIR = 'routes';
const DEFAULT_MANIFEST_NAME = 'fudic-routes.json';

/** Absolute = a root-absolute path (`/…`) or a full URL with a scheme (`https:…`). */
function isAbsoluteUrl(url: string): boolean {
  return url.startsWith('/') || /^[a-z][a-z0-9+.-]*:/iu.test(url);
}

/** Fill defaults from user options and Vite's `base`; validate `manifestUrl`. */
export function resolveOptions(user: FudicOptions = {}, base = '/'): ResolveOptionsResult {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const manifestUrl = user.manifestUrl ?? `${normalizedBase}${DEFAULT_MANIFEST_NAME}`;

  const diagnostics: FudicDiagnostic[] = [];
  if (!isAbsoluteUrl(manifestUrl)) {
    diagnostics.push({
      code: FUD_MANIFEST_URL_NOT_ABSOLUTE,
      message: `manifestUrl must be absolute (SW and WW load the same URL); got "${manifestUrl}"`,
      file: manifestUrl,
    });
  }

  return {
    options: {
      routesDir: user.routesDir ?? DEFAULT_ROUTES_DIR,
      base: normalizedBase,
      manifestUrl,
      prerender: user.prerender ?? true,
      paramFallback: user.paramFallback ?? 'lazy',
      routes: user.routes ?? {},
    },
    diagnostics,
  };
}
