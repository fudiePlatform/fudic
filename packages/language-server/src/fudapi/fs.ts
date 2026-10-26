/**
 * The disk, as the `.fudapi` host reads it: a file's text and a folder's entries. The default the
 * server mounts; tests inject a map.
 */

import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface ApiEntry {
  readonly name: string;
  readonly directory: boolean;
}

export interface ApiFs {
  /** The text of a file, or `undefined` when it cannot be read. Never throws. */
  readFile(path: string): string | undefined;
  /** The entries of a folder; none when it is not there. Never throws. */
  list(path: string): readonly ApiEntry[];
  /** Writes a file, creating its folders. Never throws: a type that cannot be written is stale, not fatal. */
  writeFile(path: string, text: string): void;
  /** Removes a file, if it is there. Never throws. */
  removeFile(path: string): void;
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
    writeFile(path, text) {
      try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, text);
      } catch {
        // A read-only disk leaves the old types; the next save tries again.
      }
    },
    removeFile(path) {
      try {
        rmSync(path, { force: true });
      } catch {
        // A file that cannot be removed stays; it types a module nobody imports any more.
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
