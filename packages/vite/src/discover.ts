/**
 * Route discovery (SDD-19 §4.1/§4.2): walk `routesDir`, keep the page `.fud` (not
 * components), and resolve each route's SSG mode from the compiler facts. Produces
 * the ordered `RouteBuild` list the plugin turns into wrapper chunks + the manifest.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { routesFromFiles, type Route } from './routing.js';
import { analyzePage, type PageAnalysis } from './analyze.js';
import { resolveMode, type ModeDecision, type PageFacts } from './mode.js';
import { ERROR_FILE } from '@fudic/conventions';
import { ERROR_PATTERN } from './page-errors.js';
import { type ResolvedOptions } from './options.js';
import { localizeRoutes } from './i18n.js';
import { FUD0364, FUD0434, type FileDiagnostic, type SourceDiagnostic } from '@fudic/diagnostics';

export interface RouteBuild {
  readonly route: Route;
  /** Absolute path to the page `.fud`. */
  readonly absPath: string;
  readonly analysis: PageAnalysis;
  readonly decision: ModeDecision;
  /**
   * The locale this route is built for (SDD-58 §4.5). Absent in an app without `locales`; with
   * them, one `RouteBuild` per route and locale, the pattern already prefixed when there are
   * two or more.
   */
  readonly locale?: string;
}

export interface DiscoverResult {
  readonly routes: readonly RouteBuild[];
  readonly diagnostics: readonly FileDiagnostic[];
  /**
   * What parsing each file under `routesDir` had to say, with the file named (SDD-35 §4.4).
   * Apart from `diagnostics` because its errors are the typecheck's to report first: the build
   * says them only if the check did not, and dev shows them in its live overlay.
   */
  readonly parse: readonly SourceDiagnostic[];
  /**
   * `_error.fud`, compiled like a route under `/_fudic/error/:status` and kept OUT of `routes`
   * (SDD-56 §4.8): it has no URL in the app, and the route table never names it.
   */
  readonly errorPage?: RouteBuild;
  /**
   * `_error.fud` once per locale (SDD-58 §4.5), each under its locale's prefix
   * (`/en/_fudic/error/:status`) when there are two or more. The first is `errorPage`. Empty
   * without `_error.fud`; `[errorPage]` in an app without `locales`.
   */
  readonly errorPages: readonly RouteBuild[];
}

const NEVER: ModeDecision = { mode: 'excluded', prerender: false, enumerate: false, prerenderedHtml: false };

/** All `.fud` files under `dir`, as POSIX-style paths relative to `dir`. */
function listFud(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir, { recursive: true }) as string[];
  } catch {
    return []; // routesDir absent → no routes
  }
  return entries.filter((e) => e.endsWith('.fud')).map((e) => e.split(sep).join('/'));
}

/** Discover the page routes under `root/routesDir` with their resolved SSG mode. */
export function discoverRoutes(
  root: string,
  options: ResolvedOptions,
  locales?: readonly string[],
): DiscoverResult {
  const routesRoot = join(root, options.routesDir);
  const files = listFud(routesRoot);
  const { routes, diagnostics } = routesFromFiles(files.filter((f) => f !== ERROR_FILE));
  const diags: FileDiagnostic[] = [...diagnostics];
  const parse: SourceDiagnostic[] = [];

  let errorPage: RouteBuild | undefined;
  if (files.includes(ERROR_FILE)) {
    const absPath = join(routesRoot, ERROR_FILE);
    const analysis = analyzePage(readFileSync(absPath, 'utf8'), absPath);
    for (const d of analysis.diagnostics) parse.push({ ...d, file: absPath });
    errorPage = {
      route: { file: ERROR_FILE, pattern: ERROR_PATTERN, params: ['status'] },
      absPath,
      analysis,
      decision: NEVER,
    };
  }

  const builds: RouteBuild[] = [];
  // A layout is never a route (SDD-21 §4.7), wherever it lives; these two sets turn the
  // ones nobody points at into FUD0434 instead of silence.
  const layouts = new Set<string>();
  const usedLayouts = new Set<string>();
  for (const route of routes) {
    const absPath = join(routesRoot, route.file);
    const analysis = analyzePage(readFileSync(absPath, 'utf8'), absPath);
    for (const d of analysis.diagnostics) parse.push({ ...d, file: absPath });
    if (analysis.role === 'layout') {
      layouts.add(absPath);
    }
    if (analysis.layoutHref !== undefined && analysis.layoutHref !== '') {
      usedLayouts.add(resolve(dirname(absPath), analysis.layoutHref));
    }
    if (!analysis.isPage) {
      continue; // a component or a layout living under routesDir is not a route
    }
    diags.push(...analysis.strategy.diagnostics);
    const fallback = options.defaults[route.pattern]?.mode;
    const facts: PageFacts = {
      hasLoad: analysis.hasLoad,
      hasPaths: analysis.hasPaths,
      strategy: analysis.strategy,
      ...(fallback ? { fallback } : {}),
    };
    const resolved = resolveMode(
      route.params.length > 0,
      facts,
      options.paramFallback,
      absPath,
    );
    diags.push(...resolved.diagnostics);
    builds.push({ route, absPath, analysis, decision: resolved.decision });
  }

  // A layout under routesDir that no route (nor another layout) points at renders nothing.
  for (const path of layouts) {
    if (!usedLayouts.has(path)) {
      diags.push(FUD0434({ file: path }));
    }
  }

  // A route default that matches no discovered route is almost certainly a typo.
  const known = new Set(builds.map((b) => b.route.pattern));
  for (const pattern of Object.keys(options.defaults)) {
    if (!known.has(pattern)) {
      diags.push(FUD0364({ file: pattern }));
    }
  }

  // One route per locale, AFTER everything above has spoken about the files: a diagnostic is
  // about a `.fud`, and the `.fud` is one whatever the number of languages it is built in.
  // `_error.fud` too: a page that fails in `/en/…` is told so in `en` (§4.5).
  const errorPages = errorPage === undefined ? [] : localizeRoutes([errorPage], locales);
  return {
    routes: localizeRoutes(builds, locales),
    diagnostics: diags,
    parse,
    errorPages,
    ...(errorPages[0] !== undefined ? { errorPage: errorPages[0] } : {}),
  };
}
