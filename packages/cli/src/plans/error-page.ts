/**
 * `fudic g error-page` (SDD-87 §3.6): the error page of a project, one whole document.
 *
 * In an app it is `src/routes/_error.fud`, as it always was. In a library it is `src/_error.fud`:
 * the page every app that depends on the library paints with when it has none of its own. It is
 * not a route — it has no URL of its own — so a library writes it without `FUD0783`.
 *
 * What it reports comes from `errorPageOf`, the one place the rule lives: in a library, who will
 * use it; in an app whose chain already brings one, that this one replaces it.
 */

import { ERROR_FILE, ROUTES_DIR } from '@fudic/conventions';
import { errorPageOf, LIBRARY_ERROR_FILE, type ErrorPageSource } from '@fudic/resolve';
import { joinPosix } from '../paths.js';
import { targetChange } from '../project.js';
import { renderTemplate } from '../templates.js';
import { packageFs } from '../workspace/link.js';
import { projectName } from '../workspace/modules.js';
import { resolveTarget } from '../workspace/target.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import { EMPTY_PLAN, type Plan, type TargetedOptions } from '../types.js';

export function planErrorPage(opts: TargetedOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  const resolved = resolveTarget(opts, io);
  if (resolved.target === undefined) return Promise.resolve({ ...EMPTY_PLAN, errors: resolved.errors });
  const target = resolved.target;
  const library = target.config.kind === 'lib';
  const file = library ? LIBRARY_ERROR_FILE : `${ROUTES_DIR}/${ERROR_FILE}`;
  // What the app paints with before this file exists: the chain's, if it brings one.
  const before = errorPageOf(target.path, ROUTES_DIR, packageFs(io));

  // The project's first language (SDD-71 §3.6), as `g page` writes it.
  const contents = renderTemplate('_error.fud', { lang: target.config.locales[0]! });
  const written = targetChange(opts.cwd, joinPosix(target.dir, file), contents, opts.force, io);
  if (written.error !== undefined) return Promise.resolve({ ...EMPTY_PLAN, errors: [written.error] });

  return Promise.resolve({
    ...EMPTY_PLAN,
    // `targetChange` gives a change or an error, never neither.
    changes: [written.change!],
    report: ['', `Created ${file} in ${target.dir}`, ...(library ? [`  every app that depends on ${packageName(target.path, projectName(target), io)} and has no _error.fud of its own paints with it`] : replaces(before))],
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
