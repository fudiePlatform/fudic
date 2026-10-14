/**
 * The erasure of server code from everything a browser receives (BUG-47 §4.1, §4.2, §4.6).
 *
 * One object for the code and for its maps, shared by every client pass — the host bundle and
 * the link pass of the Service Worker chunks — so the two can never disagree about a module.
 *
 * **The map carries the erased text, never the original.** The erasers hand Rollup a transform
 * with no map, so a chunk's map points at the original file with its whole text in
 * `sourcesContent`: the `.server(…)` half and the `serverValidator` body, readable in DevTools.
 * Each entry of a JS/TS source is erased the same way the code was. Since the erasure blanks
 * instead of cutting, every line and column of the map still lands where it did, and the
 * debugger shows the file with the server part as blank lines — the way the compiler shows the
 * `@server` of a `.fud`. Not `null`: DevTools then fetches the file from the server, which does
 * not serve it.
 *
 * Erased by source and not by the module the transform saw: a workspace package arrives as its
 * `dist/*.js` with a map back to its `.ts`, and the `.ts` is what the published map names.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eraseServerHalves } from './server-halves.js';
import { eraseServerValidators } from './server-validators.js';

/** The package a file belongs to, by the `name` of the nearest `package.json` above it. */
export type PackageOf = (file: string) => string | undefined;

const HTTP = '@fudic/http';
const SCRIPT = /\.[cm]?[jt]sx?$/u;

export class ClientErasure {
  readonly #packageOf: PackageOf;

  constructor(packageOf: PackageOf = nodePackageOf()) {
    this.#packageOf = packageOf;
  }

  /**
   * `code` erased for the browser — `serverValidator` bodies and `.server(…)` halves — or
   * `null` when it has neither.
   */
  erase(code: string, path: string): string | null {
    const validators = eraseServerValidators(code);
    const halves = eraseServerHalves(validators?.code ?? code, this.#packageOf(path) === HTTP);
    return (halves ?? validators)?.code ?? null;
  }

  /**
   * The serialized map `source`, published at `mapFile` under `outDir`, with the text of every
   * JS/TS source erased. The same string when no source had anything to erase.
   */
  blank(source: string, mapFile: string, outDir: string): string {
    const map = JSON.parse(source) as { sources?: string[]; sourcesContent?: (string | null)[] };
    const from = dirname(resolve(outDir, mapFile));
    const contents = map.sourcesContent ?? [];
    let changed = false;
    (map.sources ?? []).forEach((entry, i) => {
      const text = contents[i];
      if (text == null || !SCRIPT.test(entry)) return;
      const erased = this.erase(text, resolve(from, entry));
      if (erased === null) return;
      contents[i] = erased;
      changed = true;
    });
    return changed ? JSON.stringify(map) : source;
  }
}

/** `PackageOf` over the real filesystem, each directory asked once. */
export function nodePackageOf(): PackageOf {
  const byDir = new Map<string, string | undefined>();
  const nameIn = (dir: string): string | undefined => {
    if (byDir.has(dir)) return byDir.get(dir);
    let name: string | undefined;
    try {
      const manifest = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8')) as { name?: unknown };
      name = typeof manifest.name === 'string' ? manifest.name : undefined;
    } catch {
      // No manifest here, or one being edited: the answer is the parent's.
      const parent = dirname(dir);
      name = parent === dir ? undefined : nameIn(parent);
    }
    byDir.set(dir, name);
    return name;
  };
  return (file) => nameIn(dirname(resolve(file)));
}
