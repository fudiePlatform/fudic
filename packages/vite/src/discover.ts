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
import { type ResolvedOptions } from './options.js';
import { FUD0364, FUD0434, type FileDiagnostic } from '@fudic/diagnostics';

export interface RouteBuild {
  readonly route: Route;
  /** Absolute path to the page `.fud`. */
  readonly absPath: string;
  readonly analysis: PageAnalysis;
  readonly decision: ModeDecision;
}

export interface DiscoverResult {
  readonly routes: readonly RouteBuild[];
  readonly diagnostics: readonly FileDiagnostic[];
}

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
export function discoverRoutes(root: string, options: ResolvedOptions): DiscoverResult {
  const routesRoot = join(root, options.routesDir);
  const { routes, diagnostics } = routesFromFiles(listFud(routesRoot));
  const diags: FileDiagnostic[] = [...diagnostics];

  const builds: RouteBuild[] = [];
  // A layout is never a route (SDD-21 §4.7), wherever it lives; these two sets turn the
  // ones nobody points at into FUD0434 instead of silence.
  const layouts = new Set<string>();
  const usedLayouts = new Set<string>();
  for (const route of routes) {
    const absPath = join(routesRoot, route.file);
    const analysis = analyzePage(readFileSync(absPath, 'utf8'), absPath);
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

  return { routes: builds, diagnostics: diags };
}
