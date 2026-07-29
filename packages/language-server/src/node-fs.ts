/**
 * The one module that touches `node:fs` (SDD-24 §4.5).
 *
 * Everything else takes the `FileSystemScanner` port, so the index can be driven from a map
 * in tests and the server keeps its promise of never doing I/O per keystroke — the sweep
 * happens once, and the watchers do the rest.
 *
 * Nothing here throws. A folder that does not exist is an empty workspace, and a file that
 * disappeared between the watcher event and the read is `undefined`: both are ordinary
 * states of a project being edited, not failures.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { toPosix } from './paths.js';
import type { FileSystemScanner } from './types.js';

/** Folders a `.fud` sweep must never walk into. */
const SKIPPED = new Set(['node_modules', 'dist', '.git']);

/** The real filesystem, narrowed to what the workspace index needs. */
export function nodeFileSystem(): FileSystemScanner {
  return {
    fudFiles(root: string): readonly string[] {
      let entries: readonly string[];
      try {
        entries = readdirSync(root, { recursive: true }) as string[];
      } catch {
        return []; // the folder is not there: an empty workspace, not an error
      }

      const base = toPosix(root);
      return entries
        .map(toPosix)
        .filter((entry) => entry.endsWith('.fud'))
        .filter((entry) => !entry.split('/').some((segment) => SKIPPED.has(segment)))
        .map((entry) => `${base}/${entry}`);
    },

    readFile(path: string): string | undefined {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return undefined;
      }
    },
  };
}
