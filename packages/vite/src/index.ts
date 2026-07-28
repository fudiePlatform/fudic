/**
 * Entry point of `@fudic/vite` — the fudic Vite plugin (SDD-19, rewired by SDD-20).
 *
 * The plugin is the LINKER over the fs-free compiler emit: it discovers `.fud` files,
 * drives the emit, resolves URLs through Vite (hash/base/immutable cache), produces the
 * manifest that `@fudic/transport` consumes, emits every route chunk in two formats
 * (ESM for the edge, `exports`/`require` for the Service Worker's linker) and the two
 * bootstraps. Vite is bundler/dev-server only — it never parses `.fud`.
 *
 * The pure, Vite-free core (routing, the wrapper, mode resolution, `sw.json`, the
 * strategy reader) is exported for testing and reuse.
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
  FUD_SW_CONFIG_MALFORMED,
  FUD_SW_SHELL_MISSING,
  FUD_TTL_INVALID,
  FUD_STRATEGY_NOT_LITERAL,
  FUD_STRATEGY_DUPLICATE,
  FUD_UNLINKABLE_CONSTRUCT,
  FUD_TWO_TTLS,
  FUD_STRATEGY_AND_DEFAULT,
  FUD_SSG_WITHOUT_PATHS,
  FUD_CHUNK_NOT_EMITTED,
} from './diagnostics.js';
export { type Route, type RoutingResult, routesFromFiles } from './routing.js';
export { type RenderChunkOptions, emitRenderChunk } from './wrapper.js';
export {
  type RouteMode,
  type ModeDefault,
  type ParamFallback,
  type PageFacts,
  type ModeDecision,
  type ModeResult,
  resolveMode,
} from './mode.js';
export {
  type StrategyDecl,
  type StrategyAnalysis,
  NO_STRATEGY,
  strategyFrom,
} from './strategy.js';
export {
  type SwConfigFile,
  type ResolvedSwConfig,
  type SwConfigResult,
  type ConfigIo,
  parseTtl,
  readSwConfig,
} from './swconfig.js';
export { type PageAnalysis, analyzePage } from './analyze.js';
export {
  type RouteDefault,
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
export { type ManifestInputs, type ManifestResult, buildManifest } from './manifest.js';
export { type LinkChunk, type LinkResult, runLinkPass, safeName } from './link.js';
export {
  type BundleItem,
  type EnumeratedResult,
  htmlPathFor,
  materializeBundle,
  renderChunkToHtml,
  urlForEntry,
  prerenderEnumerated,
} from './prerender.js';
export { devModuleUrl, devUrl, devManifest } from './dev.js';
export {
  type RenderModule,
  type ModuleLoader,
  matchRouteBuild,
  paramsOf,
  edgeContext,
  drainStream,
  renderRouteHtml,
  loadRouteData,
} from './serve.js';
export { type SwBootstrapOptions, emitSwBootstrap, emitMainBootstrap } from './bootstrap.js';
export { fudic } from './plugin.js';
export { fudic as default } from './plugin.js';
