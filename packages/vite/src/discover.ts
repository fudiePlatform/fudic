/**
 * Route discovery (SDD-19 §4.1/§4.2): walk `routesDir`, keep the page `.fud` (not
 * components), and resolve each route's SSG mode from the compiler facts. Produces
 * the ordered `RouteBuild` list the plugin turns into wrapper chunks + the manifest.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { routesFromFiles, type Route } from './routing.js';
import { analyzePage, type PageAnalysis } from './analyze.js';
import { resolveMode, type ModeDecision, type PageFacts } from './mode.js';
import { type ResolvedOptions } from './options.js';
import { type FudicDiagnostic } from './diagnostics.js';

export interface RouteBuild {
  readonly route: Route;
  /** Absolute path to the page `.fud`. */
  readonly absPath: string;
  readonly analysis: PageAnalysis;
  readonly decision: ModeDecision;
}

export interface DiscoverResult {
  readonly routes: readonly RouteBuild[];
  readonly diagnostics: readonly FudicDiagnostic[];
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

  const builds: RouteBuild[] = [];
  for (const route of routes) {
    const absPath = join(routesRoot, route.file);
    const analysis = analyzePage(readFileSync(absPath, 'utf8'));
    if (!analysis.isPage) {
      continue; // a component living under routesDir is not a route
    }
    const override = options.routes[route.pattern]?.mode;
    const facts: PageFacts = {
      hasLoad: analysis.hasLoad,
      hasPaths: analysis.hasPaths,
      ...(override ? { override } : {}),
    };
    const decision = resolveMode(route.params.length > 0, facts, options.paramFallback);
    builds.push({ route, absPath, analysis, decision });
  }
  return { routes: builds, diagnostics };
}
