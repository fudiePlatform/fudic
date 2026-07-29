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
 * Once chosen, its `@RenderSection(name)`s are collected along the `rel="layout"` chain
 * (decision 87), so the generated page arrives with its sections already declared.
 */

import { cliError, FUD_LAYOUT_INVALID } from './diagnostics.js';
import { absolute, dirname, joinPosix, resolveHref } from './paths.js';
import { parseFud } from './parse.js';
import type { ReadIo } from './io.js';
import type { CliError, PlanDiagnostic } from './types.js';

const LAYOUT_FILE = '_layout.fud';
/** The conventional home of shared layouts, outside `routesDir`. */
export const LAYOUTS_DIR = 'layouts';

export interface LayoutResolution {
  /** `cwd`-relative path of the layout, or `null` for a standalone page. */
  readonly path: string | null;
  /** Every `@RenderSection` of the chain, innermost first, deduplicated. */
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
 * Follow the `rel="layout"` chain from `start`, collecting `@RenderSection` names. A cycle
 * (which the compiler reports as FUD0422) stops the walk instead of hanging.
 */
function collectSections(
  cwd: string,
  start: string,
  io: ReadIo,
): { sections: readonly string[]; diagnostics: readonly PlanDiagnostic[] } {
  const sections: string[] = [];
  const diagnostics: PlanDiagnostic[] = [];
  const seen = new Set<string>();
  let current: string | undefined = start;

  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    const path = absolute(cwd, current);
    if (!io.exists(path)) break;
    const parsed = parseFud(io.read(path));
    const file = current;
    diagnostics.push(...parsed.diagnostics.map((diagnostic) => ({ file, diagnostic })));
    if (parsed.doc.type !== 'layout-document') break;
    for (const directive of parsed.doc.renderSections) {
      if (directive.name !== '' && !sections.includes(directive.name)) sections.push(directive.name);
    }
    const parent = parsed.doc.layoutHref;
    current = parent === undefined || parent === '' ? undefined : resolveHref(current, parent);
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
