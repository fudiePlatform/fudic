/**
 * Route discovery (SDD-19 §4.1/§4.2): walk `routesDir`, keep the page `.fud` (not
 * components), and resolve each route's SSG mode from the compiler facts. Produces
 * the ordered `RouteBuild` list the plugin turns into wrapper chunks + the manifest.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { errorPageOf, nodePackageFs, type PackageFs } from '@fudic/resolve';
import { routesFromFiles, type Route } from './routing.js';
import { analyzePage, type PageAnalysis, type PageApiOf } from './analyze.js';
import { resolveMode, type ModeDecision, type PageFacts } from './mode.js';
import { ERROR_FILE } from '@fudic/conventions';
import { ERROR_PATTERN } from './page-errors.js';
import { type ResolvedOptions } from './options.js';
import { localizeRoutes } from './i18n.js';
import { FUD0364, FUD0434, FUD1570, FUD1580, FUD1581, type FileDiagnostic, type SourceDiagnostic } from '@fudic/diagnostics';

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
  /** The package `errorPage` comes from, when it is a library's: `@acme/ui`. Absent for the app's own. */
  readonly errorPageFrom?: string;
}

const NEVER: ModeDecision = { mode: 'excluded', prerender: false, enumerate: false, prerenderedHtml: false };

/** The code of a whole document with no hole (SDD-88): it has said why it is no error page. */
const HOLLOW = FUD1580({ span: { start: 0, end: 0 } }).code;

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
  /** What the `.fudapi` a route links declare (SDD-60 §4.5), by the route's absolute path. */
  apiOf?: (absPath: string) => PageApiOf,
  /** How the dependency chain is read, for the error page a library offers (SDD-87 §3.10). */
  packages: PackageFs = nodePackageFs(),
): DiscoverResult {
  const analyze = (absPath: string): PageAnalysis =>
    analyzePage(readFileSync(absPath, 'utf8'), apiOf?.(absPath));
  const routesRoot = join(root, options.routesDir);
  const files = listFud(routesRoot);
  const { routes, diagnostics } = routesFromFiles(files.filter((f) => f !== ERROR_FILE));
  const diags: FileDiagnostic[] = [...diagnostics];
  const parse: SourceDiagnostic[] = [];

  // The app's own `_error.fud`, else the one library of its chain that offers one (SDD-87 §3.2).
  // Two libraries and none of its own is FUD1570, on the app's `fudic.json`, and no page.
  let errorPage: RouteBuild | undefined;
  const source = errorPageOf(root, options.routesDir, packages);
  if (source.kind === 'ambiguous') {
    const named = source.libraries.map((l) => ({ package: l.package, file: relative(root, l.file).split(sep).join('/') }));
    diags.push(FUD1570({ file: join(root, 'fudic.json'), libraries: named }));
  }
  const errorPageFrom = source.kind === 'library' ? source.package : undefined;
  if (source.kind === 'own' || source.kind === 'library') {
    // An app's own keeps the path it always had, under routesDir. Anything else — a library's own
    // `src/_error.fud`, or the one its chain offers — is the file `errorPageOf` found.
    const absPath = source.kind === 'own' && files.includes(ERROR_FILE) ? join(routesRoot, ERROR_FILE) : source.file;
    const analysis = analyze(absPath);
    for (const d of analysis.diagnostics) parse.push({ ...d, file: absPath });
    // An error page is a page, and every page links a layout (SDD-88): one that is not a route
    // is not compiled as the error page, and the app paints its errors with the minimal one. A
    // whole document with no hole has said `FUD1580` in its parse; anything else that is not a
    // route — a component, or a layout with its holes — is `FUD1581`, over its first line: the
    // span the typecheck gives it, so the build says it once.
    if (analysis.isPage) {
      errorPage = {
        route: { file: ERROR_FILE, pattern: ERROR_PATTERN, params: ['status'] },
        absPath,
        analysis,
        decision: NEVER,
      };
    } else if (!analysis.diagnostics.some((d) => d.code === HOLLOW)) {
      const text = readFileSync(absPath, 'utf8');
      const end = text.indexOf('\n');
      parse.push({ ...FUD1581({ span: { start: 0, end: end === -1 ? text.length : end } }), file: absPath });
    }
  }

  const builds: RouteBuild[] = [];
  // A layout is never a route (SDD-21 §4.7), wherever it lives; these two sets turn the
  // ones nobody points at into FUD0434 instead of silence.
  const layouts = new Set<string>();
  const usedLayouts = new Set<string>();
  for (const route of routes) {
    const absPath = join(routesRoot, route.file);
    const analysis = analyze(absPath);
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
    ...(errorPage !== undefined && errorPageFrom !== undefined ? { errorPageFrom } : {}),
  };
}
