/**
 * What a build computes from its `.fud` files, computed ONCE per build.
 *
 * A build asks the same questions of the same files many times, and the files do not change
 * while it runs:
 *
 *   - the document graph of a route — whether it hydrates and injects (the coordinators),
 *     which components it reaches (the client chunks, the warm deps, FUD0742), whether it is
 *     reactive (the route chunks and the name lookup of each of the three passes);
 *   - the compiled module of a `.fud` — the host bundle, the link pass and the edge pass each
 *     compile the same files with the same arguments, and used to do it three times.
 *
 * The memory travels INSIDE the `ResolveIo` every pass already receives, so no signature had
 * to grow a parameter: a build hands out an io that remembers, `vite dev` keeps the plain one
 * — there the files DO change between two requests, and a remembered answer would be a page
 * that ignores the save.
 */

import { resolveDocument, type DocumentGraph, type ResolveIo } from '@fudic/compiler';

/** A `ResolveIo` that also remembers, by key, what was computed from the files it reads. */
export interface BuildIo extends ResolveIo {
  remember<T>(key: string, produce: () => T): T;
}

/** An io whose answers are computed once and kept for as long as the io lives. */
export function buildIo(io: ResolveIo): BuildIo {
  const memory = new Map<string, unknown>();
  return {
    read: (path) => io.read(path),
    resolve: (fromPath, href) => io.resolve(fromPath, href),
    remember<T>(key: string, produce: () => T): T {
      if (memory.has(key)) return memory.get(key) as T;
      const value = produce();
      memory.set(key, value);
      return value;
    },
  };
}

/** `produce()`, from memory when the io keeps one and computed afresh otherwise. */
export function remembered<T>(io: ResolveIo, key: string, produce: () => T): T {
  return 'remember' in io ? (io as BuildIo).remember(key, produce) : produce();
}

/** The graph of a document, resolved once per build. */
export function graphOf(absPath: string, io: ResolveIo): DocumentGraph {
  return remembered(io, `graph:${absPath}`, () => resolveDocument(absPath, io).value);
}
