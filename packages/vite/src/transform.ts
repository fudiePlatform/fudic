/**
 * The `.fud` → module transform (SDD-19 §4.6, the core of the Vite `transform` hook).
 * Resolves the component graph and emits the module with `.fud` import specifiers so
 * Vite owns the module-graph resolution (a page's / component's sibling imports
 * become real edges Vite bundles, hashes and tree-shakes). The compiler emits text;
 * this only picks the right emitter for a page vs a component entry.
 *
 * Source maps (§4.6) are a follow-up: the SSR emit does not yet anchor output↔source
 * offsets, so no map is produced here yet — SDD-13's `SourceMapBuilder` is ready to
 * consume those offsets once the emit records them.
 */

import {
  resolveComponents,
  emitComponentModule,
  emitPageModule,
  type ResolveIo,
  type ResolvedComponent,
} from '@fudic/compiler';

/** The extension the emitted imports point at, so Vite resolves the `.fud` graph. */
const IMPORT_EXT = '.fud';

export interface TransformResult {
  readonly code: string;
}

/** Transform one `.fud` file into its ES module, or `null` when `id` is not a `.fud`. */
export function transformFud(id: string, io: ResolveIo): TransformResult | null {
  if (!id.endsWith('.fud')) {
    return null;
  }
  const graph = resolveComponents(id, io);
  const entry = graph.entry;
  if (entry.type === 'page-document') {
    return { code: emitPageModule(graph, { importExt: IMPORT_EXT }) };
  }
  // A component entry: resolveComponents does not add the entry itself to the graph,
  // so build its ResolvedComponent from the parsed entry (its deps are already resolved).
  const comp: ResolvedComponent = {
    tag: entry.name,
    path: id,
    source: graph.entrySource,
    doc: entry,
    deps: graph.entryDeps,
  };
  return { code: emitComponentModule(graph, comp, { importExt: IMPORT_EXT }) };
}
