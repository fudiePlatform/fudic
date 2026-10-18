/**
 * Layout resolution (SDD-22 §4.5) — the one thing the CLI knows that the compiler does
 * not. SDD-21 leaves the folder-implicit layout out of v1 *because the compiler is
 * fs-free*: the edge is a `<link rel="layout" href>` written by hand. The CLI does see the
 * disk, so it supplies exactly what the compiler is barred from, with a local rule:
 *
 *   1. `--layout <path>` always wins (and must be a real layout, else FUD0449);
 *   2. otherwise the nearest `_layout.fud` walking up from the new page's directory;
 *   3. otherwise none — a standalone page, no error.
 *
 * Once chosen, its `@RenderSection(name)`s are read off that one file, so the generated page
 * arrives with its sections already declared.
 */

import { linkHref } from '@fudic/compiler';
import { FUD0449 } from '@fudic/diagnostics';
import { hrefKind } from '@fudic/resolve';
import { absolute, dirname, joinPosix, relativeTo } from './paths.js';
import { parseFud } from './parse.js';
import { workspaceFile } from './workspace/link.js';
import type { ReadIo } from './io.js';
import type { CliError, PlanDiagnostic } from './types.js';

const LAYOUT_FILE = '_layout.fud';

/** The page at `/` of a project, relative to its routes. */
const HOME_FILE = 'index.fud';

export interface LayoutResolution {
  /** `cwd`-relative path of the layout, or `null` for a standalone page. */
  readonly path: string | null;
  /** How a page links it when it is a library's: its package specifier. A path otherwise. */
  readonly specifier?: string;
  /** Every `@RenderSection` of that layout, in source order, deduplicated. */
  readonly sections: readonly string[];
  readonly diagnostics: readonly PlanDiagnostic[];
  readonly errors: readonly CliError[];
}

export function isLayout(cwd: string, file: string, io: ReadIo): boolean {
  const path = absolute(cwd, file);
  if (!io.exists(path)) return false;
  return parseFud(io.read(path)).doc.type === 'layout-document';
}

/**
 * Candidate layouts for a page, nearest first.
 *
 * `layoutsDir` is the project's, not `cwd`'s: since SDD-44 a page is written into a project
 * that may be several directories below where the command was run, and the last fallback has
 * to be that project's `src/layouts/` — the workspace root has none.
 */
function candidates(pageFile: string, routesDir: string, layoutsDir: string): readonly string[] {
  const out: string[] = [];
  let dir = dirname(pageFile);
  while (dir !== '' && dir !== '.') {
    out.push(joinPosix(dir, LAYOUT_FILE));
    if (dir === routesDir) break;
    dir = dirname(dir);
  }
  out.push(joinPosix(routesDir, LAYOUT_FILE));
  out.push(joinPosix(layoutsDir, LAYOUT_FILE));
  return [...new Set(out)];
}

/**
 * The `@RenderSection` names of ONE layout — the file itself and nothing beyond it.
 *
 * This used to walk the `rel="layout"` chain and guard against a cycle. A layout may not name
 * a layout any more (`FUD0439`), so the walk has exactly one step and the only file whose
 * holes the generated page can fill is the one it links to.
 */
function collectSections(
  cwd: string,
  file: string,
  io: ReadIo,
): { sections: readonly string[]; diagnostics: readonly PlanDiagnostic[] } {
  const sections: string[] = [];
  const path = absolute(cwd, file);
  if (!io.exists(path)) return { sections, diagnostics: [] };

  const parsed = parseFud(io.read(path));
  const diagnostics = parsed.diagnostics.map((diagnostic) => ({ file, diagnostic }));
  if (parsed.doc.type !== 'layout-document') return { sections, diagnostics };
  for (const directive of parsed.doc.renderSections) {
    if (directive.name !== '' && !sections.includes(directive.name)) sections.push(directive.name);
  }
  return { sections, diagnostics };
}

/** A layout found: its file, and the specifier a page writes when it is a library's. */
interface Located {
  readonly path: string;
  readonly specifier?: string;
}

/**
 * The file an href names: a path relative to `cwd`, or a library's specifier
 * (`@shop/ui/layouts/main.fud`) mapped to its file in the workspace. Undefined when it is a
 * specifier no project of the workspace maps.
 */
export function locateLayout(href: string, cwd: string, io: ReadIo): Located | undefined {
  // `src/layouts/x.fud` is how a person names a file of the project, and it reads like a
  // package: a file that is there settles it.
  if (hrefKind(href) !== 'package' || io.exists(absolute(cwd, href))) return { path: href };
  const found = workspaceFile(href, cwd, io);
  return found === undefined ? undefined : { path: found.file, specifier: href };
}

/** What a page links once its layout is chosen, with that layout's sections. */
function chosen(cwd: string, layout: Located, io: ReadIo): LayoutResolution {
  const collected = collectSections(cwd, layout.path, io);
  return { ...layout, sections: collected.sections, diagnostics: collected.diagnostics, errors: [] };
}

/**
 * The layout the home page of the project links, when it links one: what a project whose
 * frame lives in a library — and so has no `_layout.fud` of its own — writes every page into.
 */
function homeLayout(cwd: string, routesDir: string, io: ReadIo): Located | undefined {
  const home = joinPosix(routesDir, HOME_FILE);
  if (!io.exists(absolute(cwd, home))) return undefined;
  const doc = parseFud(io.read(absolute(cwd, home))).doc;
  const href = doc.type === 'route-document' ? linkHref(doc.layoutLink) : undefined;
  if (href === undefined || href === '') return undefined;
  const located =
    hrefKind(href) === 'package' ? locateLayout(href, cwd, io) : { path: relativeTo(cwd, absolute(cwd, joinPosix(dirname(home), href))) };
  return located !== undefined && isLayout(cwd, located.path, io) ? located : undefined;
}

export function resolveLayout(
  pageFile: string,
  explicit: string | null | undefined,
  opts: { readonly cwd: string; readonly routesDir: string; readonly layoutsDir: string },
  io: ReadIo,
): LayoutResolution {
  if (explicit === null) return { path: null, sections: [], diagnostics: [], errors: [] };

  if (explicit !== undefined) {
    const located = locateLayout(explicit, opts.cwd, io);
    if (located === undefined || !isLayout(opts.cwd, located.path, io)) {
      return {
        path: null,
        sections: [],
        diagnostics: [],
        errors: [FUD0449({ file: explicit })],
      };
    }
    return chosen(opts.cwd, located, io);
  }

  for (const candidate of candidates(pageFile, opts.routesDir, opts.layoutsDir)) {
    if (isLayout(opts.cwd, candidate, io)) return chosen(opts.cwd, { path: candidate }, io);
  }
  const home = homeLayout(opts.cwd, opts.routesDir, io);
  return home === undefined ? { path: null, sections: [], diagnostics: [], errors: [] } : chosen(opts.cwd, home, io);
}
