/**
 * The component graph of a `.fud`, resolved once per test file: a test that mounts the same
 * component ten times, or visits the same route ten times, reads and resolves its sources once.
 */

import { resolveDocument, type ComponentGraph } from '@fudic/compiler';
import { nodeIo } from '@fudic/vite/harness';

const graphs = new Map<string, ComponentGraph>();

/** The graph of a `.fud`: the components it reaches, itself included. */
export function graphOf(file: string): ComponentGraph {
  let graph = graphs.get(file);
  if (graph === undefined) {
    graph = resolveDocument(file, nodeIo()).value;
    graphs.set(file, graph);
  }
  return graph;
}
