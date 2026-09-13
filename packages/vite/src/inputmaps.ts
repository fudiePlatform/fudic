/**
 * Chain the source map a dependency already ships with.
 *
 * `@fudic/core`, `@fudic/ssr`, `@fudic/transport` and the rest are consumed as their built
 * `dist/*.js`, and every one of those files ends in `//# sourceMappingURL=<name>.js.map`
 * with a map that points back at the `.ts` it was compiled from. Nobody was reading them:
 * Rolldown does not go looking for a module's own map, so the chain stopped at the compiled
 * JavaScript and the debugger showed `signal.js` — types erased, `interface Signal<T>` gone —
 * for a file whose TypeScript was sitting on disk two directories away.
 *
 * A `load` hook is the whole fix. Handing the map back with the code is what turns
 * `dist/signal.js` into one more link of a chain that ends at `src/signal.ts`, and it costs
 * one `existsSync` per JavaScript module.
 *
 * Deliberately narrow: only a `.js` file with a `.js.map` NEXT TO IT, and only when that map
 * parses. A dependency without maps is loaded by whoever would have loaded it anyway.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** The v3 fields this module reads. Structural: the bundler's own type is not needed here. */
interface RawMap {
  sources?: (string | null)[];
  sourcesContent?: (string | null)[];
}

/**
 * Embed the text of every source the map names, reading it from disk beside the map.
 *
 * `tsc` writes `sourceMap` without `inlineSources`, so a package's `dist/*.js.map` names
 * `../src/signal.ts` and carries none of it. Chaining that map as it stands moves the problem
 * rather than solving it: the debugger now asks for a `.ts` at a URL the server does not
 * publish, and shows an empty pane instead of the compiled JavaScript it used to show.
 *
 * Here the file IS on disk — it is the very tree being built — so the content travels with
 * the map and the served output owes the source tree nothing.
 */
function withSourcesContent(map: RawMap, mapPath: string): void {
  const sources = map.sources;
  if (sources === undefined) {
    return;
  }
  const dir = dirname(mapPath);
  const content = map.sourcesContent ?? [];
  map.sourcesContent = sources.map((source, i) => {
    const existing = content[i];
    if (existing !== undefined && existing !== null) return existing;
    if (source === null || source === undefined) return null;
    const abs = resolve(dir, source);
    // `null` is the v3 spelling of "this source is not available", and it is what the field
    // already meant for this entry. A missing file is not a reason to fail a build.
    return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
  });
}

/**
 * What a `load` hook returns when the module carries its own map.
 *
 * The map travels as TEXT, not as a parsed object: a `SourceMapInput` is
 * `ExistingRawSourceMap | string | null`, so the string form is accepted as it stands and
 * this module needs no type from the bundler — and `@fudic/vite` no dependency on rolldown
 * that its `package.json` does not declare.
 */
export interface LoadedWithMap {
  readonly code: string;
  readonly map: string;
}

/**
 * The module at `id` plus the map it ships with, or `null` when there is nothing to add.
 *
 * `null` means "not mine": the caller returns it unchanged so the next `load` hook — or the
 * bundler's own file read — handles the module exactly as before.
 */
export function loadWithSourceMap(id: string): LoadedWithMap | null {
  // A query or a hash means the id is not a plain file path; those belong to whoever coined
  // them. `.mjs`/`.cjs` count: what matters is that it is JavaScript with a sibling map.
  if (/[?#]/u.test(id) || !/\.[cm]?js$/u.test(id)) {
    return null;
  }
  const mapPath = `${id}.map`;
  if (!existsSync(id) || !existsSync(mapPath)) {
    return null;
  }
  try {
    const map = JSON.parse(readFileSync(mapPath, 'utf8')) as RawMap;
    // The `.ts` text goes IN before the map is handed over: what the debugger opens has to
    // be the source, and `tsc` did not put it there.
    withSourcesContent(map, mapPath);
    return { code: readFileSync(id, 'utf8'), map: JSON.stringify(map) };
  } catch {
    // A map that does not parse is not a reason to fail a build: the module still has to
    // load. Falling through loses the chain for that one file and nothing else.
    return null;
  }
}
