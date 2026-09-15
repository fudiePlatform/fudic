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

import { LAYOUTS_DIR } from '@fudic/conventions';
import { cliError, FUD_LAYOUT_INVALID } from './diagnostics.js';
import { absolute, dirname, joinPosix, resolveHref } from './paths.js';
import { parseFud } from './parse.js';
import type { ReadIo } from './io.js';
import type { CliError, PlanDiagnostic } from './types.js';

const LAYOUT_FILE = '_layout.fud';

export interface LayoutResolution {
  /** `cwd`-relative path of the layout, or `null` for a standalone page. */
  readonly path: string | null;
  /** Every `@RenderSection` of that layout, in source order, deduplicated. */
  readonly sections: readonly string[];
  readonly diagnostics: readonly PlanDiagnostic[];
  readonly errors: readonly CliError[];
}

function isLayout(cwd: string, file: string, io: ReadIo): boolean {
  const path = absolute(cwd, file);
  if (!io.exists(path)) return false;
  return parseFud(io.read(path)).doc.type === 'layout-document';
}

/** Candidate layouts for a page, nearest first. */
function candidates(pageFile: string, routesDir: string): readonly string[] {
  const out: string[] = [];
  let dir = dirname(pageFile);
  while (dir !== '' && dir !== '.') {
    out.push(joinPosix(dir, LAYOUT_FILE));
    if (dir === routesDir) break;
    dir = dirname(dir);
  }
  out.push(joinPosix(routesDir, LAYOUT_FILE));
  out.push(joinPosix(LAYOUTS_DIR, LAYOUT_FILE));
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

export function resolveLayout(
  pageFile: string,
  explicit: string | null | undefined,
  opts: { readonly cwd: string; readonly routesDir: string },
  io: ReadIo,
): LayoutResolution {
  if (explicit === null) return { path: null, sections: [], diagnostics: [], errors: [] };

  if (explicit !== undefined) {
    if (!isLayout(opts.cwd, explicit, io)) {
      return {
        path: null,
        sections: [],
        diagnostics: [],
        errors: [cliError(FUD_LAYOUT_INVALID, `"${explicit}" is not a layout (no doctype + @RenderBody())`, explicit)],
      };
    }
    const collected = collectSections(opts.cwd, explicit, io);
    return { path: explicit, sections: collected.sections, diagnostics: collected.diagnostics, errors: [] };
  }

  for (const candidate of candidates(pageFile, opts.routesDir)) {
    if (!isLayout(opts.cwd, candidate, io)) continue;
    const collected = collectSections(opts.cwd, candidate, io);
    return { path: candidate, sections: collected.sections, diagnostics: collected.diagnostics, errors: [] };
  }
  return { path: null, sections: [], diagnostics: [], errors: [] };
}
