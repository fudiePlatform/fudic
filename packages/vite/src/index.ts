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
  strategyOfLoad,
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
// What `transformFud` is handed beside the I/O, built as the plugin builds them: a caller that
// checks a project as the build does needs the same style chains and the same asset registry.
export { ProjectStyleChains } from './styles.js';
export { LinkedAssets } from './linked-assets.js';
export { parseFud } from './parse.js';
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
export { type SwBootstrapOptions, emitSwBootstrap } from './bootstrap.js';
// The coordinator (SDD-45 §4.4), which is what the app-wide `emitMainBootstrap` became: one
// module per route, naming the pieces that route needs.
export {
  coordinatorFor,
  type ChunkResolution,
  type Coordinator,
  type CoordinatorParams,
  type PieceRef,
  type RouteFacts,
} from './coordinator.js';
export {
  type RuntimePiece,
  type RuntimeFs,
  type RuntimePiecesResult,
  runtimePieces,
} from './runtime-pieces.js';
export { type FudicCompileError, compileDiagnosticsOf, isFudicCompileError } from './report.js';
export { fudic } from './plugin.js';
export { fudic as default } from './plugin.js';
// The workbench's hooks (SDD-82 §3.8): what the bench installs before it starts the app's Vite.
export {
  BENCH_COOKIE,
  BENCH_KEY,
  benchScope,
  cookieOf,
  createBench,
  criterionOfRequest,
  installBench,
  installedBench,
  type Bench,
  type BenchCall,
  type BenchHooks,
  type CriterionNames,
  type CriterionSetup,
  type Held,
  type Recorded,
  type ServiceOverride,
} from './bench-hooks.js';
/** The id dev loads a route's wrapper by: `<prefix><pattern>`, with its `paths()` (SDD-82 §3.7). */
export { WRAPPER_PREFIX } from './constants.js';
