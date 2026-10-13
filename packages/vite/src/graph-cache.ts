/**
 * The document graph of a route, resolved ONCE per build.
 *
 * A build asks the same question of the same route many times: whether it hydrates and
 * whether it injects (the coordinators), which components it reaches (the client chunks, the
 * warm deps, FUD0742), whether it is reactive (the route chunks and the name lookup of each of
 * the three passes). Each answer used to walk and parse the whole graph again, and the files
 * do not change while a build runs.
 *
 * The cache travels INSIDE the `ResolveIo` every pass already receives, so no signature had
 * to grow a parameter: a build hands out an io that remembers, `vite dev` keeps the plain one
 * — there the files DO change between two requests, and a remembered graph would be a page
 * that ignores the save.
 */

import { resolveDocument, type DocumentGraph, type ResolveIo } from '@fudic/compiler';

/** A `ResolveIo` that also answers, from memory, the graph of a document. */
export interface GraphIo extends ResolveIo {
  graph(absPath: string): DocumentGraph;
}

/** An io whose graphs are resolved once and kept for as long as the io lives. */
export function memoizedGraphs(io: ResolveIo): GraphIo {
  const graphs = new Map<string, DocumentGraph>();
  return {
    read: (path) => io.read(path),
    resolve: (fromPath, href) => io.resolve(fromPath, href),
    graph(absPath) {
      let graph = graphs.get(absPath);
      if (graph === undefined) {
        graph = resolveDocument(absPath, io).value;
        graphs.set(absPath, graph);
      }
      return graph;
    },
  };
}

/** The graph of a document: from memory when the io keeps one, resolved afresh otherwise. */
export function graphOf(absPath: string, io: ResolveIo): DocumentGraph {
  return 'graph' in io ? (io as GraphIo).graph(absPath) : resolveDocument(absPath, io).value;
}
