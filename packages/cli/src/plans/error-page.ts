/**
 * `fudic g error-page` (SDD-87 §3.6, SDD-88 §3.3): the error page of a project, a route that links
 * the same layout as every other page.
 *
 * In an app it is `src/routes/_error.fud`, as it always was, and it links the layout `g page`
 * would choose for that file. In a library it is `src/_error.fud`: the page every app that depends
 * on the library paints with when it has none of its own, and it links the library's
 * `src/layouts/_layout.fud` — the only layout it can reach from its own folder in every app. It
 * is not a route of the library — it has no URL of its own — so a library writes it without
 * `FUD0783`. With no layout to link it writes nothing (`FUD1582`).
 *
 * What it reports comes from `errorPageOf`, the one place the rule lives: in a library, who will
 * use it; in an app whose chain already brings one, that this one replaces it.
 */

import { ERROR_FILE, LAYOUTS_DIR, ROUTES_DIR } from '@fudic/conventions';
import { errorPageOf, LIBRARY_ERROR_FILE, type ErrorPageSource } from '@fudic/resolve';
import { libraryLayout, resolveLayout } from '../layout.js';
import { hrefBetween, joinPosix } from '../paths.js';
import { targetChange } from '../project.js';
import { renderTemplate } from '../templates.js';
import { packageFs } from '../workspace/link.js';
import { projectName } from '../workspace/modules.js';
import { resolveTarget } from '../workspace/target.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import { EMPTY_PLAN, type ErrorPageOptions, type Plan } from '../types.js';

export function planErrorPage(opts: ErrorPageOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  const resolved = resolveTarget(opts, io);
  if (resolved.target === undefined) return Promise.resolve({ ...EMPTY_PLAN, errors: resolved.errors });
  const target = resolved.target;
  const library = target.config.kind === 'lib';
  const file = library ? LIBRARY_ERROR_FILE : `${ROUTES_DIR}/${ERROR_FILE}`;
  const path = joinPosix(target.dir, file);
  // What the app paints with before this file exists: the chain's, if it brings one.
  const before = errorPageOf(target.path, ROUTES_DIR, packageFs(io));

  const search = {
    cwd: opts.cwd,
    routesDir: joinPosix(target.dir, ROUTES_DIR),
    layoutsDir: joinPosix(target.dir, LAYOUTS_DIR),
    ...(opts.project !== undefined ? { project: opts.project } : {}),
  };
  const layout = library ? libraryLayout(opts.layout, search, io) : resolveLayout(path, opts.layout, search, io);
  if (layout.path === null) return Promise.resolve({ ...EMPTY_PLAN, errors: layout.errors });
  const layoutHref = layout.specifier ?? hrefBetween(path, layout.path);

  const contents = renderTemplate('_error.fud', { layoutHref });
  const written = targetChange(opts.cwd, path, contents, opts.force, io);
  if (written.error !== undefined) return Promise.resolve({ ...EMPTY_PLAN, errors: [written.error] });

  return Promise.resolve({
    ...EMPTY_PLAN,
    // `targetChange` gives a change or an error, never neither.
    changes: [written.change!],
    report: [
      '',
      `Created ${file} in ${target.dir}`,
      `  layout     ${layoutHref}`,
      ...(library ? [`  every app that depends on ${packageName(target.path, projectName(target), io)} and has no _error.fud of its own paints with it`] : replaces(before)),
    ],
  });
}

/** In an app: what this page replaces, when its chain already brought one. */
function replaces(before: ErrorPageSource): readonly string[] {
  if (before.kind === 'library') return [`  it replaces the one of ${before.package} in this app`];
  if (before.kind === 'ambiguous') return [`  it replaces the ones of ${before.libraries.map((l) => l.package).join(' and ')} in this app`];
  return [];
}

/** The name its `package.json` gives the library, or its directory's when it gives none. */
function packageName(root: string, fallback: string, io: ReadIo): string {
  const manifest = joinPosix(root, 'package.json');
  if (!io.exists(manifest)) return fallback;
  try {
    const name = (JSON.parse(io.read(manifest)) as { readonly name?: unknown }).name;
    return typeof name === 'string' ? name : fallback;
  } catch {
    return fallback; // a package.json being written names nothing yet
  }
}
