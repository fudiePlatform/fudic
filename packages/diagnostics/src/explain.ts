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
 */
export function explanationsDir(): string {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const built = /[\\/]dist[\\/]src[\\/]?$/.test(here);
  return fileURLToPath(new URL(built ? '../../src/codes/' : './codes/', import.meta.url));
}

/** The explanation file of one code, in `dir` (by default, the package's own). */
export function explanationFile(code: FudCode, dir: string = explanationsDir()): string {
  return join(dir, `${code}.md`);
}
