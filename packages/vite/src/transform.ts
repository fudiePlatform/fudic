/**
 * The `.fud` → module transform (SDD-19 §4.6, the core of the Vite `transform` hook).
 * Resolves the component graph and emits the module with `.fud` import specifiers so
 * Vite owns the module-graph resolution (a page's / component's sibling imports
 * become real edges Vite bundles, hashes and tree-shakes). The compiler emits text;
 * this only picks the right emitter for a page vs a component entry.
 *
 * Source maps (§4.6): the emit anchors each verbatim source slice (interpolation,
 * control-flow headers) to its `.fud` offset; `SourceMapBuilder` (SDD-13) turns those
 * output↔source pairs into a Source Map v3, so a runtime error in the served JS
 * navigates back to the `.fud`. Vite chains this map through the rest of its pipeline.
 *
 * Asset linking (§4.5): `linkAssets` makes the emit rewrite static relative asset URLs
 * (`src`/`poster`/`<link href>`, CSS `url(…)`) into ES imports, which Vite then
 * resolves, hashes and emits — the plugin is the linker, Vite owns the asset pipeline.
 */

import {
  resolveComponents,
  emitComponentModuleMapped,
  emitPageModuleMapped,
  SourceMapBuilder,
  LineMap,
  type ResolveIo,
  type ResolvedComponent,
  type EmitOutput,
  type SourceMapV3,
} from '@fudic/compiler';

/** The extension the emitted imports point at, so Vite resolves the `.fud` graph. */
const IMPORT_EXT = '.fud';

export interface TransformResult {
  readonly code: string;
  readonly map: SourceMapV3;
}

/** Build a Source Map v3 for one emitted module from the emit's output↔source anchors. */
function buildMap(id: string, source: string, out: EmitOutput): SourceMapV3 {
  const file = id.replace(/\\/gu, '/');
  const builder = new SourceMapBuilder({
    file,
    source: file,
    sourceContent: source,
    sourceLineMap: new LineMap(source),
    generatedLineMap: new LineMap(out.code),
  });
  for (const m of out.mappings) builder.addMapping(m.generatedOffset, m.sourceOffset);
  return builder.build();
}

/** Transform one `.fud` file into its ES module, or `null` when `id` is not a `.fud`. */
export function transformFud(id: string, io: ResolveIo): TransformResult | null {
  if (!id.endsWith('.fud')) {
    return null;
  }
  const graph = resolveComponents(id, io);
  const entry = graph.entry;
  const source = graph.entrySource;
  let out: EmitOutput;
  if (entry.type === 'page-document') {
    out = emitPageModuleMapped(graph, { importExt: IMPORT_EXT, linkAssets: true });
  } else {
    // A component entry: resolveComponents does not add the entry itself to the graph,
    // so build its ResolvedComponent from the parsed entry (its deps are already resolved).
    const comp: ResolvedComponent = {
      tag: entry.name,
      path: id,
      source,
      doc: entry,
      deps: graph.entryDeps,
    };
    out = emitComponentModuleMapped(graph, comp, { importExt: IMPORT_EXT, linkAssets: true });
  }
  return { code: out.code, map: buildMap(id, source, out) };
}
