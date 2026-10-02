/**
 * The disk, as `@fudic/spec` reads it: a directory listing and a file's text. The default the
 * server mounts; tests inject a map.
 */

import { readFileSync, readdirSync } from 'node:fs';
import type { SpecFs } from '@fudic/spec';

export function nodeSpecFs(): SpecFs {
  return {
    readDirectory(path) {
      try {
        return readdirSync(path);
      } catch {
        return []; // no folder is an empty vocabulary, not an error
      }
    },
    readFile(path) {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return undefined;
      }
    },
  };
}
