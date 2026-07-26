/**
 * Entry point of `@fudic/vite` — the fudic Vite plugin (SDD-19).
 *
 * The plugin is the LINKER over the fs-free compiler emit: it discovers `.fud`
 * files, drives the emit, resolves URLs through Vite (hash/base/immutable cache),
 * produces the route→chunk manifest that `@fudic/transport` consumes, and emits
 * the three-thread bootstraps. Vite is bundler/dev-server only — it never parses
 * `.fud`.
 *
 * This module grows as the Slice-1 pieces land; the pure, Vite-free core (routing,
 * the render-chunk wrapper, the `@server` hooks) is exported for testing and reuse.
 */

export const VERSION = '0.0.1';

export {
  type FudicDiagnostic,
  FUD_MALFORMED_PARAM,
  FUD_ROUTE_COLLISION,
  FUD_PATHS_INCOMPLETE,
  FUD_ASSET_NOT_FOUND,
  FUD_UNKNOWN_ROUTE_OVERRIDE,
  FUD_MANIFEST_URL_NOT_ABSOLUTE,
} from './diagnostics.js';
export { type Route, type RoutingResult, routesFromFiles } from './routing.js';
export { type RenderChunkOptions, emitRenderChunk } from './wrapper.js';
export {
  type RouteMode,
  type ModeOverride,
  type ParamFallback,
  type PageFacts,
  type ModeDecision,
  resolveMode,
} from './mode.js';
export { type PageAnalysis, analyzePage } from './analyze.js';
export {
  type RouteOverride,
  type FudicOptions,
  type ResolvedOptions,
  type ResolveOptionsResult,
  resolveOptions,
} from './options.js';
export { nodeIo } from './io.js';
export { type TransformResult, transformFud } from './transform.js';
export { parseFud } from './parse.js';
export { emitServerModule } from './server.js';
export { type RouteBuild, type DiscoverResult, discoverRoutes } from './discover.js';
export { buildManifest } from './manifest.js';
export { type BundleItem, htmlPathFor, materializeBundle, renderChunkToHtml } from './prerender.js';
export { devModuleUrl, devUrl, devManifest } from './dev.js';
export { emitWwBootstrap, emitSwBootstrap, emitMainBootstrap } from './bootstrap.js';
export { fudic } from './plugin.js';
export { fudic as default } from './plugin.js';
