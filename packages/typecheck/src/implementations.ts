/**
 * The handlers a developer writes beside a `.fudapi` (SDD-60 §4.6), in the program of a check.
 *
 * Their two folders — `src/server` and `src/browser`, or what `fudic.json` names — and the
 * types generated in `.fudic/api` enter the program whatever the `tsconfig.json` lists: a
 * handler whose signature does not fit its contract is an error of the project, in dev and in
 * the build, and a project that forgot an `include` would otherwise ship it.
 *
 * Its problems are TypeScript's, in the `.ts` and at its offsets: no projection is involved.
 */

import type * as ts from 'typescript';
import { readProjectConfig } from '@fudic/config';
import { API_TYPES_DIR, BROWSER_DIR, SERVER_DIR } from '@fudic/conventions';
import { toPosix } from './paths.js';

export interface Implementations {
  /** The `.ts` of the two folders: the files whose problems the check reports. */
  readonly sources: readonly string[];
  /** Everything to add to the program: those, and the generated `.d.ts`. */
  readonly roots: readonly string[];
  /** Whether a changed path can change the lists above. */
  covers(path: string): boolean;
}

export function implementationsOf(typescript: typeof ts, root: string): Implementations {
  const { config } = readProjectConfig(root, {
    exists: (path) => typescript.sys.fileExists(path),
    // Asked only after `exists`: a file that vanished in between reads as text that is no JSON.
    read: (path) => String(typescript.sys.readFile(path)),
  });
  const folders = [config?.server ?? SERVER_DIR, config?.browser ?? BROWSER_DIR].map((dir) => `${root}/${dir}`);
  const types = `${root}/${API_TYPES_DIR}`;
  const list = (dir: string, extensions: readonly string[]): string[] =>
    typescript.sys.readDirectory(dir, extensions, ['**/node_modules/**'], ['**/*']).map(toPosix);
  const sources = folders.flatMap((dir) => list(dir, ['.ts', '.mts', '.cts'])).filter((f) => !f.endsWith('.d.ts'));
  const declarations = list(types, ['.d.ts']);
  return {
    sources,
    roots: [...sources, ...declarations],
    covers: (path) => [...folders, types].some((dir) => toPosix(path).startsWith(`${dir}/`)),
  };
}
