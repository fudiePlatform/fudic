/**
 * Keeping erased server code out of the published source maps (BUG-47 §4.2).
 *
 * The erasers hand Rollup a transform with no map, so the chunk's map points at the ORIGINAL
 * file and carries its whole text in `sourcesContent`: the `.server(…)` half and the
 * `serverValidator` body, readable in DevTools by anyone. Taking the argument out of the code
 * does not take it out of the map.
 *
 * The entry of every erased module is set to `null`. Its `sources` entry stays, so the lines
 * still resolve and stepping through the client half works the same; only the text does not
 * travel. A module that only the erased code reached is not in the bundle any more (§4.1), so
 * it is not in the map either.
 *
 * Matched by ABSOLUTE path, resolved from the map's own directory, and never by the relative
 * text of `sources`: the same module is `../src/auth.ts` from one chunk and `../../src/auth.ts`
 * from another.
 */

import { dirname, resolve } from 'node:path';
import { eraseServerHalves } from './server-halves.js';
import { eraseServerValidators } from './server-validators.js';

/** The modules an erasure changed, by absolute POSIX path. Shared by every client pass. */
export class ErasedModules {
  readonly #paths = new Set<string>();

  /**
   * `code` erased for the browser — `serverValidator` bodies and `.server(…)` halves — or
   * `null` when it has neither. A module that changed is remembered under `path`.
   */
  erase(code: string, path: string): string | null {
    const validators = eraseServerValidators(code);
    const halves = eraseServerHalves(validators?.code ?? code);
    const erased = halves ?? validators;
    if (erased === null) return null;
    this.#paths.add(normalize(path));
    return erased.code;
  }

  /**
   * The serialized map `source`, published at `mapFile` under `outDir`, with the text of every
   * erased module taken out. The same string when there is nothing to take.
   */
  blank(source: string, mapFile: string, outDir: string): string {
    if (this.#paths.size === 0) return source;
    const map = JSON.parse(source) as { sources?: string[]; sourcesContent?: (string | null)[] };
    const from = dirname(resolve(outDir, mapFile));
    const contents = map.sourcesContent ?? [];
    let changed = false;
    (map.sources ?? []).forEach((entry, i) => {
      if (contents[i] == null || !this.#paths.has(normalize(resolve(from, entry)))) return;
      contents[i] = null;
      changed = true;
    });
    return changed ? JSON.stringify(map) : source;
  }
}

/** One spelling per file: POSIX separators, as Vite writes a module id. */
function normalize(path: string): string {
  return resolve(path).replace(/\\/gu, '/');
}
