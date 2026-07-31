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
    /**
     * The sweep PRUNES as it descends; it does not walk everything and filter afterwards.
     *
     * The difference is not stylistic. `node_modules` is where almost all the files in a
     * project are, and a recursive read that visits it before discarding it pays for the
     * whole store — seconds, on the one operation §4.5 promised would happen once at
     * startup and never per keystroke.
     */
    fudFiles(root: string): readonly string[] {
      const base = toPosix(root);
      const found: string[] = [];

      const visit = (dir: string, prefix: string): void => {
        let entries;
        try {
          entries = readdirSync(dir, { withFileTypes: true });
        } catch {
          return; // the folder is not there: an empty workspace, not an error
        }
        for (const entry of entries) {
          if (SKIPPED.has(entry.name)) continue;
          const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
          if (entry.isDirectory()) visit(`${dir}/${entry.name}`, relative);
          else if (entry.name.endsWith('.fud')) found.push(`${base}/${relative}`);
        }
      };

      visit(root, '');
      return found;
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
