/**
 * Where a code's explanation (`FUDnnnn.md`) is on disk, for the editor's "Explain" action.
 *
 * A subpath of its own (`@fudic/diagnostics/explain`) because it needs Node: nothing that runs
 * in a browser should reach it through the main entry.
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FudCode } from './types.js';

/**
 * The folder the explanations ship in. The `.md` files are published as `src/codes/*.md`, and
 * this module runs from `src/` in the workspace and from `dist/src/` once built: `./codes/`
 * from the former, `../../src/codes/` from the latter — both are the package's `src/codes/`.
 * Bundled into the editor's server, it is `./codes/` beside the bundle, where the extension's
 * build copies them. `from` is the module's own URL; a test passes another.
 */
export function explanationsDir(from: string = import.meta.url): string {
  const here = fileURLToPath(new URL('.', from));
  const built = /[\\/]dist[\\/]src[\\/]?$/.test(here);
  return fileURLToPath(new URL(built ? '../../src/codes/' : './codes/', from));
}

/** The explanation file of one code, in `dir` (by default, the package's own). */
export function explanationFile(code: FudCode, dir: string = explanationsDir()): string {
  return join(dir, `${code}.md`);
}
