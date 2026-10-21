/**
 * The disk, as the `.fudapi` host reads it: a file's text and a folder's entries. The default the
 * server mounts; tests inject a map.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';

export interface ApiEntry {
  readonly name: string;
  readonly directory: boolean;
}

export interface ApiFs {
  /** The text of a file, or `undefined` when it cannot be read. Never throws. */
  readFile(path: string): string | undefined;
  /** The entries of a folder; none when it is not there. Never throws. */
  list(path: string): readonly ApiEntry[];
}

export function nodeApiFs(): ApiFs {
  return {
    readFile(path) {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return undefined;
      }
    },
    list(path) {
      try {
        // A dependency is a link in a pnpm `node_modules`: followed, it is the folder it points at.
        return readdirSync(path, { withFileTypes: true }).map((entry) => ({
          name: entry.name,
          directory: entry.isDirectory() || (entry.isSymbolicLink() && linksToFolder(`${path}/${entry.name}`)),
        }));
      } catch {
        return []; // no folder is no files, not an error
      }
    },
  };
}

/** Whether a link points at a folder; a broken one points at nothing. */
function linksToFolder(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
