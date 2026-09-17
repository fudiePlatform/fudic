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

import { existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { assetUrlFrom, type LinkedAssets } from './linked-assets.js';
import {
  resolveDocument,
  contractDiagnostics,
  injectionDiagnostics,
  entryComponent,
  emitComponentModuleMapped,
  emitComponentClientModuleMapped,
  emitComponentIocModule,
  emitPageModuleMapped,
  emitLayoutModuleMapped,
  emitRouteModuleMapped,
  emitRouteClientModuleMapped,
  SourceMapBuilder,
  LineMap,
  redactServerRegions,
  type Diagnostic,
  type DocumentGraph,
  type ResolveIo,
  type ResolvedComponent,
  type ResolvedLayout,
  type EmitOutput,
  type ProjectStyle,
  type SourceMapV3,
} from '@fudic/compiler';

/** The extension the emitted imports point at, so Vite resolves the `.fud` graph. */
const IMPORT_EXT = '.fud';

export interface TransformResult {
  readonly code: string;
  readonly map: SourceMapV3;
  /** Linkable asset specifiers that did not resolve to a file (reported as FUD0363). */
  readonly missingAssets: readonly string[];
  /**
   * Graph-level diagnostics from following the layout chain (SDD-21: FUD0422 cycle,
   * FUD0423/FUD0435 the target is not a layout, FUD0429 orphan section). They concern the
   * relation between two files, so only the resolver can see them. Plus the emit's own
   * (BUG-13): the syntax errors of a `@code` that Oxc could not parse.
   */
  readonly diagnostics: readonly Diagnostic[];
}

/** A POSIX, explicitly-relative specifier from `fromDir` to `target` (`./x.fud`, `../y/x.fud`). */
export function relativeSpecifier(fromDir: string, target: string): string {
  const rel = relative(fromDir, target).replace(/\\/gu, '/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

/**
 * Build a Source Map v3 for one emitted module from the emit's output↔source anchors.
 *
 * The `source` it receives is already REDACTED of its `@server` regions (BUG-09 §4.3): a
 * map embeds the original file in `sourcesContent`, and the original file of a page holds
 * server-only code. The redaction is character for character, so every offset the emit
 * anchored still lands where it did — which is why the same text feeds `sourceLineMap`.
 */
function buildMap(id: string, source: string, out: EmitOutput): SourceMapV3 {
  const file = id.replace(/\\/gu, '/');
  const builder = new SourceMapBuilder({
    file,
    source: file,
    sourceContent: source,
    sourceLineMap: new LineMap(source),
    generatedLineMap: new LineMap(out.code),
  });
  for (const m of out.mappings) builder.addMapping(m.generatedOffset, m.sourceOffset, m.name);
  return builder.build();
}

/**
 * The project's stylesheets, already read (SDD-42 §3.2).
 *
 * It travels through every emit path of the build — the host transform, the client chunk,
 * the edge pass and the link pass — because the three ways of rendering a route have to
 * produce the same document, and a sheet missing from one of them is exactly the kind of
 * difference nobody sees until a page renders unstyled in one shape only.
 */
export type ProjectStyles = readonly ProjectStyle[];

/** The emit options for one `.fud`: asset linking and the injected specifiers. */
function emitOptionsFor(
  id: string,
  routeName: string | undefined,
  styles: ProjectStyles,
  assets: LinkedAssets | undefined,
): Parameters<typeof emitPageModuleMapped>[1] {
  // A linkable asset exists when it resolves to a real file next to the `.fud` (§6.13) —
  // or, for a root-absolute `/logo.svg`, when the project's public directory holds it.
  // Without a registry there is nothing to ask, and a root-absolute URL is waved through
  // rather than reported: it may well be served by something that is not this build.
  const baseDir = dirname(id);
  return {
    importExt: IMPORT_EXT,
    linkAssets: true,
    assetExists: (spec: string): boolean =>
      spec.startsWith('/')
        ? assets === undefined || assets.publicFile(spec) !== undefined
        : existsSync(resolve(baseDir, spec)),
    // And its URL is the host's to decide, once for the whole build (BUG-40). Absent only
    // for a caller that has no registry — then the emit falls back to an import, which is
    // the pre-BUG-40 behaviour and what the standalone emit does.
    ...(assets === undefined ? {} : { assetUrl: assetUrlFrom(assets, baseDir) }),
    // The compiler is filesystem-free and would emit the sibling default `./<tag>.fud`;
    // here the real path is known, so a component may live outside the importer's
    // directory (`components/app-card.fud` linked from `routes/blog/index.fud`).
    componentSpecifier: (component: ResolvedComponent): string =>
      relativeSpecifier(baseDir, component.path),
    // Same seam for the layout chain (SDD-21 §3.4), so `layouts/` may live anywhere.
    layoutSpecifier: (layout: ResolvedLayout): string =>
      relativeSpecifier(baseDir, layout.path),
    // And the same seam for the route's own name (SDD-39 §4.7): the compiler holds one file
    // and has never heard of a URL pattern. Absent for anything that is not a built route,
    // and then the page publishes no `fud-route` block and claims no id.
    ...(routeName === undefined ? {} : { routeName }),
    // Omitted when the project declares none, rather than passed empty: an absent option is
    // what the standalone emit and every pre-SDD-42 project look like, and the emit's own
    // default is what keeps their output byte for byte the same.
    ...(styles.length === 0 ? {} : { projectStyles: styles }),
  };
}

/** Transform one `.fud` file into its ES module, or `null` when `id` is not a `.fud`. */
export function transformFud(
  id: string,
  io: ResolveIo,
  routeName?: string,
  styles: ProjectStyles = [],
  assets?: LinkedAssets,
): TransformResult | null {
  if (!id.endsWith('.fud')) {
    return null;
  }
  // `resolveDocument` is `resolveComponents` plus the layout chain: for a page or a
  // component the chain is empty and the graph is the same one the emit always saw.
  const resolved = resolveDocument(id, io);
  const graph = resolved.value;
  const entry = graph.entry;
  const source = graph.entrySource;
  const out = emitFor(id, graph, emitOptionsFor(id, routeName, styles, assets));
  return {
    code: out.code,
    map: buildMap(id, redactServerRegions(source, entry.code), out),
    missingAssets: out.missingAssets,
    // The emit's own: a `@code` whose JS does not parse (BUG-13 §5.3). Without them the
    // module still gets written — degraded — and the build only trips later, in the
    // prerender, on an identifier the emit never declared.
    //
    // Plus the component contract (BUG-23 §4.4): a required prop nobody passed, a `.prop` the
    // child does not declare, a `slot=` the parent does not. Only a caller that RESOLVED the
    // graph can ask those, which is why they are the build's to report and not the parser's.
    // And the injection contract (SDD-38 §6.21): an `inject` of a class no module enrols and
    // no component owns. It is the build's for the same reason, plus one of its own — it
    // READS the neighbouring module, which only whoever holds the I/O can do.
    diagnostics: [
      ...resolved.diagnostics,
      ...out.diagnostics,
      ...contractDiagnostics(graph),
      ...injectionDiagnostics(graph, io),
    ],
  };
}

/**
 * Transform one `.fud` into its CLIENT chunk (SDD-15 §6.8, SDD-39 §3.5) — the `?client` id.
 *
 * A component's chunk is its `static c($props)` and its `define`; a ROUTE's is a default
 * export that adopts the composed page from the `<body>`. Both are bundler INPUT and carry
 * the `@code { @client }` region verbatim, TypeScript included; stripping types is the
 * caller's job, as it is for `?server`.
 *
 * `null` for a LAYOUT, whose markup is static in this version (SDD-39 §7), and for a route
 * with no client half — which is the base case and the reason a level-1 page costs nothing.
 */
export function transformFudClient(
  id: string,
  io: ResolveIo,
  styles: ProjectStyles = [],
  assets?: LinkedAssets,
): TransformResult | null {
  if (!id.endsWith('.fud')) {
    return null;
  }
  const resolved = resolveDocument(id, io);
  const graph = resolved.value;
  const entry = graph.entry;
  if (entry.type === 'route-document' || entry.type === 'page-document') {
    return routeClientResult(id, graph, styles, resolved.diagnostics, assets);
  }
  if (entry.type !== 'component-document') {
    return null;
  }
  // `entryComponent` and not a literal of the same fields: `ExtractedCode` is memoized on
  // the object, so a second one would be a second Oxc invocation for one file.
  const comp = entryComponent(graph)!;
  const out = emitComponentClientModuleMapped(
    graph,
    comp,
    emitOptionsFor(id, undefined, styles, assets),
  );
  return {
    code: out.code,
    map: buildMap(id, redactServerRegions(graph.entrySource, entry.code), out),
    missingAssets: out.missingAssets,
    // The emit's own: a `@code` whose JS does not parse (BUG-13 §5.3). Without them the
    // module still gets written — degraded — and the build only trips later, in the
    // prerender, on an identifier the emit never declared.
    diagnostics: [...resolved.diagnostics, ...out.diagnostics],
  };
}

/** The client chunk of a route, or `null` when it has no client half at all (SDD-39 §3.1). */
function routeClientResult(
  id: string,
  graph: DocumentGraph,
  styles: ProjectStyles,
  graphDiagnostics: readonly Diagnostic[],
  assets: LinkedAssets | undefined,
): TransformResult | null {
  const out = emitRouteClientModuleMapped(graph, emitOptionsFor(id, undefined, styles, assets));
  if (out === null) {
    return null;
  }
  return {
    code: out.code,
    map: buildMap(id, redactServerRegions(graph.entrySource, graph.entry.code), out),
    missingAssets: out.missingAssets,
    diagnostics: [...graphDiagnostics, ...out.diagnostics],
  };
}

/**
 * The IoC module of one component (SDD-38 §4.5) — the `?ioc` id — or `null` when the
 * component registers nothing the browser runs.
 *
 * It exists because a provider cannot live inside the component that declares it: writing a
 * provider promotes nothing, so its owner may be N1, with no chunk at all. The factory lives
 * here instead, in a module fetched only when a page publishes a map naming this tag.
 */
export function transformFudIoc(id: string, io: ResolveIo): IocResult | null {
  if (!id.endsWith('.fud')) {
    return null;
  }
  const resolved = resolveDocument(id, io);
  const graph = resolved.value;
  if (graph.entry.type !== 'component-document') {
    return null;
  }
  const code = emitComponentIocModule(entryComponent(graph)!);
  if (code === null) {
    return null;
  }
  // No map: every line of this module is a statement copied verbatim from the `@code` it
  // came from, and the offsets that would anchor it are the ones `?client` already publishes
  // for the same file.
  return { code, diagnostics: resolved.diagnostics };
}

/** What the IoC transform hands back: text and what the graph had to say. No map. */
export interface IocResult {
  readonly code: string;
  readonly diagnostics: readonly Diagnostic[];
}

/** Pick the emitter for the entry's role (SDD-21 §4.7). */
function emitFor(
  id: string,
  graph: DocumentGraph,
  emitOptions: Parameters<typeof emitPageModuleMapped>[1],
): EmitOutput {
  const entry = graph.entry;
  switch (entry.type) {
    case 'page-document':
      return emitPageModuleMapped(graph, emitOptions);
    case 'route-document':
      return emitRouteModuleMapped(graph, emitOptions);
    case 'layout-document': {
      // A layout entry is never in `graph.layouts` — only a ROUTE puts one there — so its
      // `ResolvedLayout` is built here, mirroring the component case.
      const self: ResolvedLayout = {
        path: id,
        source: graph.entrySource,
        doc: entry,
        deps: graph.entryDeps,
      };
      return emitLayoutModuleMapped(graph, self, emitOptions);
    }
    default:
      // A component entry: the resolver does not add the entry itself to the graph, so the
      // compiler builds — and memoizes — its `ResolvedComponent` from the parsed entry.
      return emitComponentModuleMapped(graph, entryComponent(graph)!, emitOptions);
  }
}
