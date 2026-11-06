/**
 * Where a path a tool was given lands, and whether it may: inside the project, and never in
 * `.git`, `node_modules` or the generated `.fudic`. A link that points outside is outside.
 */

import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { FUD1400, type FileDiagnostic } from '@fudic/diagnostics';

/** Folders no tool reads or writes into. */
const CLOSED: ReadonlySet<string> = new Set(['.git', 'node_modules', '.fudic']);

/**
 * Whether `inner` is `outer` or under it. Climbing out is a first segment that IS `..`: a file
 * called `..notes` is inside.
 */
export function within(outer: string, inner: string): boolean {
  const rel = relative(outer, inner);
  return !isAbsolute(rel) && rel.split(sep)[0] !== '..';
}

/** The absolute path of `path` in the project at `root`, or why it is refused. */
export function locate(root: string, path: string): { readonly path: string } | { readonly error: FileDiagnostic } {
  const refused = { error: FUD1400({ file: path }) };
  const absolute = resolve(root, path);
  if (!within(root, absolute)) return refused;
  if (relative(root, absolute).split(sep).some((segment) => CLOSED.has(segment))) return refused;
  if (existsSync(absolute) && !within(realpathSync(root), realpathSync(absolute))) return refused;
  return { path: absolute };
}
