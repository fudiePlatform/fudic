/**
 * The fudic Vite plugin (SDD-19 §3.1, rewired by SDD-20). The LINKER over the fs-free
 * compiler emit: it discovers page `.fud` under `routesDir`, transforms every `.fud` to
 * a module (Vite owns the graph), emits one wrapper per route in TWO formats — ESM for
 * the edge and prerender, `exports`/`require` for the Service Worker's own linker — the
 * manifest both sides read, and the two bootstraps.
 *
 * Vite is bundler and dev server only; the parser is always `@fudic/compiler`.
 */

import { existsSync, readFileSync, realpathSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';
import { type EnvironmentModuleGraph, type Logger, type Plugin, type ViteDevServer, transformWithOxc } from 'vite';
import { createUrlResolver, LINKER_NEEDS, wantsNonce } from '@fudic/transport';
import { type FudicOptions, type ResolvedOptions, resolveOptions } from './options.js';
import { discoverRoutes, type RouteBuild } from './discover.js';
import { buildManifest } from './manifest.js';
import { routeHints } from './hints.js';
import { emitRenderChunk, routeApi } from './wrapper.js';
import { benchScope, criterionOfRequest, installedBench } from './bench-hooks.js';
import { emitBootBootstrap, emitSwBootstrap } from './bootstrap.js';
import {
  transformFudClient,
  transformFudIoc,
  NO_STYLES,
  type ProjectStyles,
  type SourceLabel,
} from './transform.js';
import { toPosix } from '@fudic/typecheck/problems';
import { API_EXTENSION } from '@fudic/api';
import { API_SCHEME, ApiProject, nothingToImplement } from './api-modules.js';
import { BROWSER_ROOT_ID, ROOT_FILE_PREFIX, SERVER_ROOT_ID, emitRoot } from './api-root.js';
import { emitFunctionsModule, isFnPath, noFunction, type ContractsHandler } from './functions.js';
import { createServer, type FudicServer, type ServerApp, type ServerOptions } from '@fudic/server';
import { diskSpool, nodeMiddleware, staticPages } from '@fudic/server/node';
import { emitServerModule } from './server-module.js';
import { loadWithSourceMap } from './inputmaps.js';
import {
  CLIENT_QUERY,
  IOC_QUERY,
  clientChunkName,
  clientId,
  discoverComponents,
  discoverReactiveRoutes,
  iocChunkName,
  iocId,
  routeEagerTags,
  routeWarmTags,
  routeHydrates,
  routeNameLookup,
  routeUsesDi,
  routeInParts,
} from './client.js';
import {
  INLINE_QUERY,
  IOC_SUFFIX,
  RUNTIME_MARKER,
  translateScript,
  type LocaleCompile,
  type ResolveIo,
  type EarlyHint,
} from '@fudic/compiler';
import {
  Catalogs,
  LocaleIos,
  alternatesOf,
  catalogFileOf,
  chunkDir,
  errorPageFor,
  handedOn,
  hasQuery,
  localeOf,
  idWithoutLocale,
  negotiate,
  pageModuleOf,
  resolveForLocale,
  compilesPerLocale,
  mayLocalize,
  soleLocale,
  redirectHtml,
  unprefixedPages,
  withLocale,
  withoutLocale,
  type LocaleContext,
} from './i18n.js';
import {
  BROWSER_DIR,
  DEFAULT_LOCALE,
  PIPES_DIR,
  SERVER_DIR,
  RUNTIME_CACHE_PREFIX,
  RUNTIME_DIR,
  runtimeMarkerUrl,
} from '@fudic/conventions';
import { nodeIo, nodeLinkCheckIo, nodeRuntimeFs } from './io.js';
import { buildIo } from './build-memory.js';
import { compileFud } from './compile.js';
import { runtimePieces } from './runtime-pieces.js';
import {
  coordinatorFor,
  GRAPH_TOKEN_RE,
  type ChunkResolution,
  type Coordinator,
  type CoordinatorParams,
  type PieceRef,
} from './coordinator.js';
import {
  deferredPieces,
  insidePublisher,
  linkedPieces,
  runtimeCacheOf,
  loadedPieces,
  pieceUrl,
  piecesToCopy,
  publisherOf,
  runtimeLinkage,
  runtimeShim,
  shimIdFor,
  shimSpecifier,
  RUNTIME_SHIM,
  type RuntimeLinkage,
} from './runtime-link.js';
import { checkLinks } from './link-check.js';
import { checkPeers } from './peer-check.js';
import { readSwConfig, type ResolvedSwConfig } from './swconfig.js';
import { baselineTarget, nodeConfigIo, readProject, type ProjectResult } from './config.js';
import { ProjectStyleChains } from './styles.js';
import { nodePackageFs } from '@fudic/resolve';
import { CONFIG_FILE, HEADERS_FILES, readHeaders, type CspNeed, type HeadersRead, type ServeConfig } from '@fudic/config';
import { LinkedAssets } from './linked-assets.js';
import { runLinkPass, safeName, type LinkResult } from './link.js';
import { runEdgePass, type EdgeExtras } from './edge.js';
import { buildServiceWorker } from './swbuild.js';
import { emitPlan, type NestedArtifact, type NestedOutputOptions } from './nested.js';
import {
  htmlPathFor,
  materializeBundle,
  renderChunkToHtml,
  prerenderEnumerated,
  SessionRead,
  type BundleItem,
} from './prerender.js';
import { policyDeclaresNonce } from './diagnostics.js';
import {
  checkAssets,
  checkEmitted,
  devHeadersOf,
  manifestHeadersOf,
  pageCspOf,
  writeCspNeeds,
  builtFilesOf,
  publicFilesOf,
  type EmittedNeeds,
} from './headers.js';
import { BuildReporter, reportText, type ReportContext } from './report.js';
import { startBackgroundCheck, type BackgroundCheck } from './background-check.js';
import { summarize } from './typecheck.js';
import {
  FUD0362,
  FUD1300,
  FUD0363,
  FUD0366,
  FUD0391,
  FUD0399,
  FUD0620,
  FUD1027,
  FUD0622,
  FUD0742,
  FUD0801,
  FUD0803,
  FUD0852,
  type FileDiagnostic,
  type FudDiagnostic,
} from '@fudic/diagnostics';
import { devUrl, devManifest, devClientTag, devClientPrefix, withInlineSourceMap } from './dev.js';
import {
  documentFiles,
  type RenderModule,
} from './serve.js';
import { asError, NO_LIVE_CHECK, startLiveCheck } from './dev-typecheck.js';
import { resilientChecker, startLiveChecker } from './live-checker.js';
import {
  WRAPPER_PREFIX,
  SW_ID,
  COORD_PREFIX,
  MAIN_ID,
  BOOT_ID,
  FUNCTIONS_FILE,
  SERVER_FILE,
  BUILD_TOKEN,
  BUILD_ID_LENGTH,
  DEV_MAIN_URL,
  DEV_BOOT_URL,
  DEV_SW_URL,
  DEV_SHEET_DIR,
  bootFileName,
  PAGE_NAME_PREFIX,
} from './constants.js';
import { chunkNamesOf } from './names.js';
import { runtimeUrls, type RuntimeEntries } from './constants.js';
import { planRename, rewriteReferences, mapNameOf, isHashedChunk } from './rename.js';
import { keepSet, reachableChunks, type PruneItem } from './prune.js';

/** What `server.mjs` exports (SDD-81 §3.10), as preview imports it. */
interface BuiltServer {
  readonly createApp: (io: { readonly prerendered: (pathname: string) => Promise<string | null> }) => ServerApp;
  readonly config: ServeConfig;
  /** Present in the workbench's own build (SDD-82 §4.7). */
  readonly bench?: boolean;
}

/**
 * The placeholder a head carries where the preloads of what its page hydrates at load go, one
 * per route (BUG-53 §4.3). The graph only exists in `generateBundle`, after the head that names
 * it was compiled, so the head names this and the bundle fills it in.
 */
function eagerToken(pattern: string): string {
  return `__fudic_eager_${createHash('sha256').update(pattern).digest('hex').slice(0, 8)}__`;
}

/** The token as the bundler wrote it, inside whichever quotes the minifier chose. */
const EAGER_TOKEN_RE = /(["'`])(__fudic_eager_[0-9a-f]{8}__)\1/gu;

/**
 * The bundle as reachability items, keyed by its ORIGINAL keys — which is what `imports`
 * speaks in, whatever `fileName` was later moved to (§5.2).
 */
function bundleItems(
  bundle: Record<string, { type: string; imports?: readonly string[]; dynamicImports?: readonly string[] }>,
): PruneItem[] {
  return Object.entries(bundle).map(([fileName, item]) => ({
    type: item.type,
    fileName,
    ...(item.type === 'chunk' && item.imports !== undefined ? { imports: item.imports } : {}),
    ...(item.type === 'chunk' && item.dynamicImports !== undefined ? { dynamicImports: item.dynamicImports } : {}),
  }));
}

/** A path with forward slashes, as Vite's module graph spells it. */
const slash = (path: string): string => path.replace(/\\/gu, '/');

/** Split a module id into its path and query (without the `?`). */
function splitId(id: string): { path: string; query: string } {
  const q = id.indexOf('?');
  return q === -1 ? { path: id, query: id.slice(0, 0) } : { path: id.slice(0, q), query: id.slice(q + 1) };
}

/** Strip the site base from a request path, so routes are matched at root. */
function pathnameOf(url: string, base: string): string {
  const path = url.split('?')[0] ?? '/';
  return path.startsWith(base) ? path.slice(base.length - 1) : path;
}

/**
 * The stable dev URLs (base already stripped) → the virtual id served at each one.
 *
 * In dev these two are middleware URLs, not files, and that is invisible to the part of
 * Vite that PRE-TRANSFORMS: `transformIndexHtml` warms up every `<script type="module"
 * src>` it finds in the HTML we serve, and a warmup goes straight into the module
 * pipeline — it never reaches a connect middleware. With nothing resolving
 * `/fudic-main.js`, the warmup failed and logged `Pre-transform error: Failed to load
 * url /fudic-main.js`; the page still worked, because the BROWSER's request does go
 * through the middleware. Resolving the URL to the same id the middleware serves closes
 * the gap: one module, one graph entry, both paths.
 */
const DEV_SCRIPT_IDS: ReadonlyMap<string, string> = new Map([
  [`/${DEV_MAIN_URL}`, MAIN_ID],
  [`/${DEV_BOOT_URL}`, BOOT_ID],
  [`/${DEV_SW_URL}`, SW_ID],
]);

export function fudic(userOptions: FudicOptions = {}): Plugin {
  let options: ResolvedOptions;
  let root = process.cwd();
  let base = '/';
  let outDir = '';
  let publicDir = '';
  let isDev = false;
  /**
   * How a file is named in `data-fud-src`: only in dev and only when asked — a build never
   * carries it, whatever the option says.
   */
  const sourceLabel = (): SourceLabel | undefined =>
    userOptions.sourceLocations === true && isDev ? (file) => toPosix(relative(root, file)) : undefined;
  let builds: readonly RouteBuild[] = [];
  /** `_error.fud`, out of the route table (SDD-56 §4.8): one per locale (SDD-58 §4.5). */
  let errorPages: readonly RouteBuild[] = [];
  let swConfig: ResolvedSwConfig | null = null;
  /**
   * The project sheets a style guide of the chain imports, by their `fudic.json` entry: they
   * reach every page through the guide, so no page keeping a rule of them is no dead CSS
   * (SDD-79). Read in `buildStart`, with the chain.
   */
  let guidedSheets: ReadonlySet<string> = new Set();
  /** Who this project is (SDD-41). Empty until `configResolved` has run. */
  let project: ProjectResult = { config: null, errors: [] };
  /**
   * The app id that namespaces this application's caches (BUG-33). Resolved once, here,
   * so the two places that bake it into the worker read a string and not an optional:
   * where a worker is actually emitted it cannot be empty, because a `sw.json` without an
   * `id` is FUD0721 and the build already stopped (SDD-41 §4.3).
   */
  let appId = '';
  /** Where the edge pass writes and the preview reads the server bundle (`edgeDir`). */
  let edgeDir = '';
  /**
   * The workbench's own build (SDD-82 §4.7): a build or a preview in a process where the bench is
   * installed. Its routes and functions answer the bench's criteria with their fixtures, and its
   * edge goes beside its `outDir`, inside the bench's folder. A `vite build` of anyone else never
   * has the bench installed.
   */
  let benchBuild = false;
  /** Set by `config`: this Vite is a `vite preview`. */
  let previewing = false;
  /**
   * The languages of the app, from `fudic.json` (SDD-58 §3.1); `[DEFAULT_LOCALE]` when it
   * declares none (SDD-71). One language has no prefixes and no catalog of its own.
   */
  let locales: readonly string[] = [DEFAULT_LOCALE];
  /** Where the app is published (§4.7): the origin of the head's absolute URLs in a build. */
  let site: string | undefined;
  /** The catalogs, read and never written (§4.10), and the io each locale's graph reads by. */
  let catalogs: Catalogs | undefined;
  let localeIos: LocaleIos | undefined;
  /** The route table, one route per locale when there are locales (§4.5). */
  const discover = (): ReturnType<typeof discoverRoutes> =>
    discoverRoutes(root, options, locales, (fud) => (href) => api.page(resolvePath(dirname(fud), href)));
  /**
   * The io a module compiled for `locale` reads `.fud` through. An untagged module is the one
   * locale's in an app with one (SDD-71), and plain in an app with two or more.
   */
  const ioFor = (locale: string | undefined): ResolveIo => {
    const target = locale ?? soleLocale(locales);
    return target === undefined || localeIos === undefined ? io : localeIos.for(io, target);
  };
  /**
   * Dev's coordinator for a locale whose chunks have a directory: `fudic-main.en.js`, serving
   * `fudic-main?locale=en`, which resolves chunks under `en/` (§4.6). Every other page keeps
   * the one `fudic-main.js`.
   */
  const devMains = (): ReadonlyMap<string, string> =>
    new Map(
      locales
        .filter((l) => chunkDir(l, locales) !== '')
        .map((l) => [`/${MAIN_ID}.${l}.js`, withLocale(MAIN_ID, l)]),
    );
  const devMainUrl = (locale: string | undefined): string =>
    devUrl(base, chunkDir(locale, locales) === '' ? DEV_MAIN_URL : `${MAIN_ID}.${locale}.js`);
  /**
   * What the nested passes compile each locale's graph with, as this plugin does (§4.6).
   * Undefined only before `configResolved` has read the catalogs.
   */
  const localeContext = (): LocaleContext | undefined =>
    localeIos === undefined || catalogs === undefined
      ? undefined
      : {
          root,
          locales,
          ...(site === undefined ? {} : { site }),
          implementations: implementationDirs(),
          ioFor: (baseIo, locale) => localeIos!.for(baseIo, locale),
          compileFor: (locale) => catalogs!.compileFor(locale),
        };
  /** How a module is compiled for `locale`, for the emit's own use (`lang`, alternates). */
  const compileFor = (locale: string | undefined): LocaleCompile | undefined => {
    const target = locale ?? soleLocale(locales);
    return target === undefined ? undefined : catalogs?.compileFor(target);
  };
  /**
   * The project's stylesheets, already read (SDD-42), and those of the libraries it consumes
   * (SDD-43 §4.6). Every emit path of the build is handed this same reader; a project with no
   * `fudic.json`, or no `styles`, answers nothing for every file and its output is byte for
   * byte what it was before that SDD.
   */
  let projectStyles: ProjectStyles = NO_STYLES;
  /**
   * The reader behind `projectStyles`, kept typed so `buildStart` can ask it two things the
   * seam does not carry: what THIS project declares (FUD0742), and what reading the
   * libraries' sheets had to say.
   */
  let styleChains: ProjectStyleChains | null = null;
  /** `FUD0740` / `FUD0741`, reported in `buildStart` alongside the config's own. */
  let styleErrors: readonly FileDiagnostic[] = [];
  /** `FUD0743`, read once per sheet rather than once per route it travels into (§4.5). */
  let styleWarnings: readonly FileDiagnostic[] = [];
  /**
   * The three `.headers` files (SDD-84), read in `configResolved` and again in dev when one
   * changes: a change is good for the next response, without a restart (§4.5).
   */
  let appHeaders: HeadersRead = { config: { page: [], sw: [], assets: [] }, diagnostics: [], sources: {} };
  const readAppHeaders = (): HeadersRead =>
    readHeaders(root, nodeConfigIo(), { kind: project.config?.kind ?? 'app', sw: swConfig !== null });
  /** What each page's emit put in it that a CSP has to let in, by page and locale (§4.7). */
  const pageNeeds = new Map<string, readonly CspNeed[]>();
  /**
   * Everything the output needs, gathered: each page's, and the Service Worker's — what its
   * linker declares, as the worker bundles it (SDD-84 §3.4) — when the app has one.
   */
  const emittedNeeds = (): EmittedNeeds => ({
    page: [...pageNeeds.values()].flat(),
    ...(swConfig === null ? {} : { sw: LINKER_NEEDS }),
  });
  let writeToDisk = true;
  /** Vite's logger: where the typecheck prints every problem before the build fails once. */
  let logger: Logger | undefined;
  /**
   * How every diagnostic of this build is told (SDD-35 §4.4): with its position, all of a file
   * at once, and never twice. Shared with the link and edge passes, which compile the same
   * files again.
   */
  let reporter = new BuildReporter(root);
  /**
   * The files the project's `.fud` link, and their published names (BUG-40).
   *
   * One registry for the whole build, handed to every nested pass: the name of a linked file
   * has to be the same in the page that references it and in the output that contains it,
   * and those two come out of different builds.
   */
  let linked = new LinkedAssets('/');
  let resolveAlias: unknown;
  // What the nested builds inherit from the host (BUG-05 §3.1, BUG-06 §3.1). Replaced
  // wholesale in `configResolved`; these are only the values before one has run.
  let nested: NestedOutputOptions = { sourcemap: false, minify: false };
  let manifestUrl = '/fudic-routes.json';
  let manifestFileName = 'fudic-routes.json';
  /**
   * The io every pass reads `.fud` through. A build swaps it in `buildStart` for one that
   * remembers each document graph and each compiled `.fud` (`buildIo`), fresh per build; dev
   * keeps this plain one, because there the files change between two requests.
   */
  let io: ResolveIo = nodeIo((path) => api.linked(path));
  /**
   * The `.fudapi` of the project and of its direct dependencies (SDD-60 §3.10): the modules
   * `fudic:<id>`, their `.d.ts` and what the compiler is told about a linked file. Replaced in
   * `configResolved`, once the root is known.
   */
  let api = new ApiProject(root);
  /** The app's two folders of implementations, from `fudic.json` or the conventions (§3.15). */
  const apiFolders = (): { readonly server: string; readonly browser: string; readonly pipes: string } => ({
    server: project.config?.server ?? SERVER_DIR,
    browser: project.config?.browser ?? BROWSER_DIR,
    pipes: project.config?.pipes ?? PIPES_DIR,
  });
  /** The generated root of a side (§4.4). */
  const rootSource = (side: 'server' | 'browser'): string =>
    emitRoot({ side, folders: apiFolders(), libraries: api.libraries, ids: api.ids() });
  /**
   * The module `fudic:<id>` of a side. The browser variant brings the browser root with it: the
   * client halves and the `runs both` rules a call needs are registered by whoever imports a
   * contract, without anybody else having to remember.
   *
   * Not a file with nothing to implement — pipes, types, enums (SDD-71 §3.3): it has no contract
   * to register a half for, and bringing the root would load all of `src/browser` for one
   * `@(x | p)`.
   */
  const apiModule = (id: string, side: 'server' | 'browser', locale?: string): string | undefined => {
    const text = api.module(id, side, compileFor(locale));
    if (text === undefined || side === 'server' || nothingToImplement(api.source(id)!)) return text;
    return `import ${JSON.stringify(BROWSER_ROOT_ID)};\n${text}`;
  };
  /**
   * The `server/` and `browser/` folders of the libraries, real and posix: a half there fills the
   * contracts of the locale that loads it, so in an app with languages it compiles per locale.
   * Asked on every `resolveId` of a locale's graph, and they only move when `api` is replaced:
   * worked out once per `api`, not with two `realpathSync` per library and per import.
   */
  const implementationDirsOf = new WeakMap<ApiProject, readonly string[]>();
  const implementationDirs = (): readonly string[] => {
    let dirs = implementationDirsOf.get(api);
    if (dirs === undefined) {
      dirs = api.libraries.flatMap((lib) => [`${slash(realpathSync(lib.dir))}/${lib.server}/`, `${slash(realpathSync(lib.dir))}/${lib.browser}/`]);
      implementationDirsOf.set(api, dirs);
    }
    return dirs;
  };
  /**
   * Every module of the implementation folders, the server root and whatever holds a contract —
   * the `fudic:<id>`, the wrappers, the `.fud` — out of a dev graph: the next request evaluates
   * them all again, the root in its order, and its contracts are new ones nobody filled.
   */
  const invalidateImplementations = (graph: EnvironmentModuleGraph): void => {
    const folders = apiFolders();
    const dirs = [`${slash(root)}/${folders.server}/`, `${slash(root)}/${folders.browser}/`, ...implementationDirs()];
    for (const mod of graph.idToModuleMap.values()) {
      const file = mod.file === null ? '' : slash(mod.file);
      // What holds a contract goes too: a fresh root fills fresh slots, so nobody empties them.
      const holder = mod.id !== null && (mod.id.startsWith(API_SCHEME) || mod.id.startsWith(WRAPPER_PREFIX) || file.endsWith('.fud'));
      if (holder || (mod.id !== null && idWithoutLocale(mod.id) === rootFile('server')) || dirs.some((dir) => file.startsWith(dir))) graph.invalidateModule(mod);
    }
  };
  /**
   * What a generated module resolves to, without its locale: a root to its file, a `fudic:<id>`
   * the project declares to itself; `undefined` for anything else.
   */
  const generatedId = (id: string): string | undefined =>
    id === SERVER_ROOT_ID || id === BROWSER_ROOT_ID
      ? rootFile(id === SERVER_ROOT_ID ? 'server' : 'browser')
      : id === rootFile('server') || id === rootFile('browser') || (id.startsWith(API_SCHEME) && api.source(id.slice(API_SCHEME.length)) !== undefined)
        ? id
        : undefined;
  /** The id a root resolves to: a file of the project that is never on disk. */
  const rootFile = (side: 'server' | 'browser'): string => `${slash(root)}/${ROOT_FILE_PREFIX}${side}.js`;
  /** Whether the app declares a `.fudapi` of its own beyond pipes: only then is there a root to load. */
  const hasApi = (): boolean => api.hasRoot();
  /** The server variant of a generated module, as a nested pass serves it, by id. */
  /**
   * A generated module of a side, as a nested pass serves it, by id. A `fudic:<id>` writes the
   * texts of its `.fudapi` in the locale of the id (SDD-74 §4.5); the rest differ between locales
   * only in what their imports resolve to.
   */
  const generatedText = (tagged: string, side: 'server' | 'browser'): string | undefined => {
    const id = idWithoutLocale(tagged);
    if (id === (side === 'server' ? SERVER_ROOT_ID : BROWSER_ROOT_ID)) return rootSource(side);
    return id.startsWith(API_SCHEME) ? apiModule(id.slice(API_SCHEME.length), side, localeOf(tagged)) : undefined;
  };
  const serverApi = (id: string): string | undefined => generatedText(id, 'server');
  /** The browser variant, as the link pass serves it to the pages the Service Worker renders. */
  const browserApi = (id: string): string | undefined => generatedText(id, 'browser');
  const linkCheckIo = nodeLinkCheckIo();
  const runtimeFs = nodeRuntimeFs();
  /**
   * The published runtime this build links (SDD-45 §4.2), discovered in `buildStart`.
   *
   * Empty in dev on purpose (§4.15): there the runtime is served out of Vite's module graph,
   * with no `_fudic/` and no version in the URL, because publishing pieces is a property of
   * the BUILD and a dev server that did it would lose hot reload of the runtime for nothing.
   * Empty here also means «bundle it», which is exactly what dev should do.
   */
  let runtime: RuntimeLinkage = { urlOf: new Map(), byUrl: new Map(), packages: [], roots: new Map() };
  /**
   * Route pattern → the coordinator that route loads, or `null` when it has nothing to
   * hydrate (SDD-45 §4.4).
   *
   * Built in `buildStart`, before anything is emitted, because three different passes — this
   * plugin, the link pass and the edge pass — each render the same route and all three have
   * to write the SAME URL into its head.
   */
  let coordinators = new Map<string, Coordinator | null>();
  /**
   * The `.fud` of a page, with the locale it was compiled for → the sheets its head links, as
   * the emit hinted them (SDD-70 §3.10). Filled by the host pass, read by the manifest.
   */
  const pageHints = new Map<string, readonly EarlyHint[]>();
  const pageHintKey = (path: string, locale: string | undefined): string =>
    `${path.replace(/\\/gu, '/')}#${locale ?? ''}`;
  /**
   * `boot` as the dev server serves it: only with a worker in dev (`dev: 'preview'`); `dev:
   * 'off'` — or no `sw.json` at all — registers nothing, so the page asks for nothing (§4.11).
   */
  const devBootUrl = (): string =>
    swConfig !== null && swConfig.dev === 'preview' ? devUrl(base, DEV_BOOT_URL) : '';
  /**
   * The hints of a page in dev (SDD-73 §4.1): its head's sheets as the dev server serves them,
   * then the two entries at their stable URLs. There is no bundle, so no closure under `main`.
   * Read once its module is loaded: that is when its head was compiled.
   */
  const devHintsOf = (rb: RouteBuild | undefined): readonly string[] =>
    rb === undefined || project.config?.earlyHints === false
      ? []
      : routeHints(pageHints.get(pageHintKey(rb.absPath, rb.locale)) ?? [], [devBootUrl(), devMainUrl(rb.locale)]);
  /**
   * What dev and preview tell `createServer` (SDD-81 §3.11–§3.12). Over `http` both are local, and
   * their cookies go out without `Secure` so the app also works from another device of the
   * network; over `https`, as in production. A proxy is trusted when `fudic.json` says so, and
   * the CSRF secret is `FUDIC_SECRET` when there is one.
   */
  const serveOptions = (https: boolean, serve: ServeConfig = project.config?.serve ?? {}): ServerOptions => ({
    secureCookies: https,
    // On Node an upload waits on disk, never in memory (SDD-81 §3.5).
    spool: diskSpool,
    ...(serve.trustProxy === true ? { trustProxy: true } : {}),
    ...(serve.uploads !== undefined ? { uploads: serve.uploads } : {}),
    ...(process.env['FUDIC_SECRET'] !== undefined ? { secret: process.env['FUDIC_SECRET'] } : {}),
  });
  /**
   * Route pattern → what its page hydrates at LOAD, by the name the runtime asks for it, the
   * locale's directory included (BUG-53 §4.3). Filled with the coordinators, and only in a
   * build with no worker: with one the head preloads nothing.
   */
  let eagerByPattern = new Map<string, readonly string[]>();
  /** Source → the id it is emitted under, so one combination produces one chunk. */
  const coordinatorIds = new Map<string, string>();
  /** Id → source, for `load`. The inverse of the map above, kept rather than searched. */
  const coordinatorSources = new Map<string, string>();

  /**
   * What a route's head is handed about the runtime in a BUILD (SDD-45 §3.6, §4.5).
   *
   * Everything empty when the route has no coordinator, and that is not a degraded case: a
   * page that does not hydrate has no file and writes no tag, and the emit decides the tag
   * from the same fact.
   *
   * The pieces are the LOAD closure of this route's coordinator — what a `modulepreload`
   * has to name for the browser to open every connection while it is still reading the head
   * — and `inline` is the coordinator's own source, for a layout that asked to carry it in
   * the document. Both are derived from the same coordinator the file is emitted from, so
   * the head cannot name a set the module does not import.
   *
   * The source goes in as it was generated, with `BUILD_TOKEN` still inside it: the edge
   * chunk that carries this constant is substituted like every other emitted file, so the
   * embedded module ends up with the same build id as the one on disk.
   */
  const runtimeEntriesFor = (pattern: string): RuntimeEntries => {
    const coordinator = coordinators.get(pattern) ?? null;
    // A route with nothing to hydrate still registers the worker — fudic is offline-first,
    // and the first visit to a static route must not leave the app with none — unless the
    // project has no worker at all, and then there is nothing to register (§4.11).
    if (coordinator === null) return runtimeUrls(base, '', [], '', swConfig !== null);
    return runtimeUrls(
      base,
      coordinator.name,
      // **No preloads when this application has a Service Worker**, and it is measured rather
      // than argued: Chrome reports every one of them as «a preload … is not used because it
      // is a cross-world service worker resource mismatch». The preload scanner fetches the
      // URL in one world and the module graph asks for it in the other, so the file is
      // downloaded twice and the preload is thrown away — on every controlled load.
      //
      // It is the same wall `writeRuntimeTags` hit for the two entries, written down there
      // since BUG-31: «under the Service Worker the two requests land in different worlds and
      // do not match». And with a worker the preload has almost nothing to buy: from the
      // second visit the pieces are a cache read, so what it would flatten is the chain of
      // ONE uncontrolled load — a round trip against a duplicated download of every piece,
      // every load, forever.
      //
      // Without one, the head also preloads what the page hydrates at LOAD, chunk and graph
      // (BUG-53 §4.3), through a token the bundle fills once that graph exists.
      swConfig === null
        ? [
            ...loadedPieces(coordinator.source, runtime),
            ...(eagerByPattern.has(pattern) ? [eagerToken(pattern)] : []),
          ]
        : [],
      coordinator.source,
      swConfig !== null,
    );
  };

  /**
   * Whether a chunk is a coordinator, asked by its FACADE module.
   *
   * There used to be one `fudic-main` and this was an equality. There are now as many as
   * there are combinations of pieces (SDD-45 §4.4), so everything that treated the startup as
   * an entry — what the worker precaches, which chunks carry the build id, what the prune
   * keeps — asks this instead. By facade and not by file name: the output naming is the
   * host's to configure, and the one thing that cannot move is which module a chunk is of.
   */
  const isCoordinatorChunk = (facade: string | null | undefined): boolean =>
    facade === MAIN_ID || (facade?.startsWith(COORD_PREFIX) ?? false);

  /**
   * How this build names the pieces a coordinator can start (SDD-45 §4.4, §4.15).
   *
   * In a BUILD each one is its published URL and the name is the uniform `install` of §3.4:
   * the coordinator imports the piece, not the package that holds it. In DEV nothing is
   * published, so it is the package specifier and the name the source exports, served out of
   * Vite's module graph — unversioned, hot-reloadable, and the same SHAPE, which is what
   * stops dev and build from being two programs.
   *
   * `missing` is what a build cannot write a coordinator without. It should be empty: the
   * publisher's own build produced these, and `FUD0804` already spoke if the directory was
   * not there at all.
   */
  const coordinatorParams = (
    chunks: ChunkResolution,
  ): { params: CoordinatorParams; missing: readonly string[] } => {
    const hasWorker = swConfig !== null && (!isDev || swConfig.dev === 'preview');
    const missing: string[] = [];
    // A project that resolves no publisher at all is not a build that links — it bundles, the
    // way every build did before SDD-45 and the way dev still does. Saying `FUD0801` there
    // would be reporting a runtime nobody published as a missing piece.
    const links = chunks.mode === 'build' && runtime.packages.length > 0;
    const piece = (pkg: string, name: string, devFrom: string, devName: string): PieceRef => {
      // A package this project does not reach publishes nothing HERE, and that is not a
      // defect: the coordinator names it as a package and the bundler resolves it, exactly as
      // it did before this SDD. `FUD0801` is for the other case — the publisher IS in the
      // graph and the piece it should have produced is not there, which is a broken
      // publication and would be a 404 in a browser.
      if (!links || !runtime.packages.includes(pkg)) return { from: devFrom, name: devName };
      const url = pieceUrl(runtime, pkg, name);
      if (url === undefined) missing.push(`${pkg.replace('@fudic/', '')}/${name}`);
      return { from: url ?? devFrom, name: url === undefined ? devName : 'install' };
    };
    return {
      params: {
        // With no worker the warm is `<link>`s, and they name each chunk's graph, which the
        // coordinator carries for its route (BUG-53 §4.3). With one, the worker deposits the
        // graph off the manifest and links are banned.
        chunks: chunks.mode === 'build' && !hasWorker ? { ...chunks, embedsGraph: true } : chunks,
        pieces: {
          hydrate: piece('@fudic/core', 'hydrate', '@fudic/core', 'installHydration'),
          warm: hasWorker
            ? piece('@fudic/core', 'warm-sw', '@fudic/core', 'createServiceWorkerWarmChannel')
            : piece('@fudic/core', 'warm-preload', '@fudic/core', 'createPreloadWarmChannel'),
          di: piece('@fudic/di', 'page', '@fudic/di/page', 'installPage'),
          parts: piece('@fudic/core', 'parts', '@fudic/core', 'readParts'),
          urls: {
            ...piece('@fudic/transport', 'urls', '@fudic/transport', 'createUrlResolver'),
            // Not a startup piece: the coordinator CALLS it to derive URLs, so it keeps the
            // name it exports rather than the uniform one (§3.4, library pieces).
            name: 'createUrlResolver',
          },
        },
      },
      missing,
    };
  };

  /**
   * The client module a dev client URL names, or `undefined` when it names none.
   *
   * The lookup is tag → component, over the graph the routes reach: the runtime only ever
   * asks for tags that carry a `data-fud-id`, and those are components of that graph by
   * construction. A tag nobody rendered simply has no module, and the request falls through.
   */
  const devClientModuleId = (path: string): string | undefined => {
    const tag = devClientTag(path);
    if (tag === null) {
      return undefined;
    }
    // `<tag>.ioc` names the component's IoC module, not its chunk (SDD-38 §4.5). One
    // resolver for both, because the browser derives both URLs the same way.
    // `en/app-card`: a locale's chunks live under its own directory (SDD-58 §4.6).
    const slash = tag.indexOf('/');
    // One locale has no directory and no tag: an untagged module is compiled for it (SDD-71).
    const locale = slash === -1 ? undefined : tag.slice(0, slash);
    const named = slash === -1 ? tag : tag.slice(slash + 1);
    const localized = (id: string): string => (locale === undefined ? id : withLocale(id, locale));
    const isIoc = named.endsWith(IOC_SUFFIX);
    const bare = isIoc ? named.slice(0, -IOC_SUFFIX.length) : named;
    const comp = discoverComponents(builds, io).find((c) => c.tag === bare);
    if (comp !== undefined) {
      return localized(isIoc ? iocId(comp.path) : clientId(comp.path));
    }
    // A ROUTE's chunk lives at the same stable prefix under its own name (SDD-39 §4.12): dev
    // builds nothing, so the derivation is the one the bootstrap baked in and the server
    // publishes the `?client` module at that URL.
    const route = discoverReactiveRoutes(builds, io).find((r) => r.name === bare);
    return route === undefined ? undefined : localized(clientId(route.path));
  };

  /**
   * The chunk name of the route this `.fud` IS, or `undefined` when it is not one.
   *
   * A route with no client half has no name to publish either: what it would name is a chunk
   * nobody emitted, and the block is then a byte for nothing (SDD-39 §4.7).
   *
   * The lookup is built ONCE per set of routes and kept, which is what `routeNameLookup`
   * documents itself as — "one lookup, resolved once per pass", the way the link pass and the
   * edge pass already hold theirs. Calling the factory per `transform` re-resolved every
   * route's document graph for every `.fud` the build touched: sixteen routes parsed again
   * for each of fifty-seven files, and the hook that does the compiling spent more than
   * twenty times its own work rediscovering what had not changed (BUG-34 §2).
   *
   * Invalidated by the IDENTITY of `builds`: `discoverRoutes` hands back a NEW array every
   * time it runs, and it runs whenever the route tree changes — which is what dev needs, and
   * the reason this is not a plain `const` computed at plugin construction, when `builds` is
   * still empty.
   */
  let routeNames: {
    readonly from: readonly RouteBuild[];
    readonly of: (path: string, locale?: string) => string | undefined;
  } | null = null;
  const routeNameOf = (path: string, locale?: string): string | undefined => {
    if (routeNames === null || routeNames.from !== builds) {
      routeNames = { from: builds, of: routeNameLookup(builds, io) };
    }
    return routeNames.of(path, locale);
  };

  /**
   * The build's typecheck, running in its own process since `buildStart` (`startBackgroundCheck`),
   * and its verdict: the failure line when it found errors, `undefined` when it found none. Its
   * problems are printed — once — the moment the report arrives.
   *
   * Both `undefined` in dev, which has its live check instead, and once the build is over.
   */
  let runningCheck: BackgroundCheck | undefined;
  let verdict: Promise<string | undefined> | undefined;

  /**
   * Wait for the typecheck's verdict, and fail with it when it found errors.
   *
   * What makes running it in the background invisible: the check used to finish before
   * anything was compiled, so it was always the first thing a build said, and the reporter
   * knew what it had said — a diagnostic the emit finds again is not repeated. Every caller
   * that is about to say something waits here first, so both stay true. A healthy build says
   * nothing until `buildEnd`, which is why the wait costs it nothing.
   */
  const settleCheck = async (context: ReportContext): Promise<void> => {
    if (verdict === undefined) return;
    const failure = await verdict;
    if (failure !== undefined) context.error({ message: failure });
  };

  /** `reporter.report`, after the typecheck has spoken — when there is anything to report. */
  const report = async (
    context: ReportContext,
    diagnostics: readonly FudDiagnostic[],
    module?: string,
  ): Promise<void> => {
    if (diagnostics.length > 0) await settleCheck(context);
    reporter.report(context, diagnostics, module);
  };

  return {
    name: 'fudic',
    // Runs before `vite:resolve`, which is what claims this plugin's generated ids before
    // anything tries to find them on disk. That protection used to come from the `\0`
    // prefix on those ids; the prefix is gone because Vite/Rolldown drops a `\0` module
    // from the source map, and the code this plugin GENERATES is precisely the code worth
    // debugging. See the header of `constants.ts` for the measurement.
    enforce: 'pre',

    config(userConfig, env) {
      // `vite preview` resolves its config as `serve`: only the env tells it from dev.
      previewing = env.isPreview === true;
      // The app is the client shell, and it has TWO main-thread entries since BUG-31 §T2:
      // `fudic-boot` (register the Service Worker — every page) and `fudic-main` (the
      // hydration runtime — only a page that hydrates).
      //
      // They are named HERE with `BUILD_TOKEN` standing in for the build id, which does not
      // exist yet at config time. `generateBundle` substitutes the id for the token — same
      // length, so every offset holds and the map generated for this code still describes
      // it. Naming them `fudic-main.js` here and renaming them to `fudic-main-<id>.js` later
      // is what BROKE the maps: that rewrite is 9 characters longer, it runs over every
      // chunk that mentions the name (the Service Worker's own `SHELL` among them), and it
      // runs AFTER the map was generated. It is the same trick the Service Worker has used
      // since BUG-05 §4.4, applied to the two entries that had been the exception.
      //
      // `fudic-sw.js` is NOT a chunk of this output any more: it has its own build, so
      // nothing here has to pin its name (BUG-03 §4.1). `chunkFileNames` goes back to
      // Vite's default.
      const hasOutputConfig = userConfig?.build?.rollupOptions?.output !== undefined;
      // Rolldown warns when a plugin takes «significant time» of the build. This one always
      // does, by construction: it compiles every `.fud`, runs the link, edge and Service
      // Worker builds inside `generateBundle` and prerenders the routes, so nearly all of a
      // fudic build is spent here. The warning read as a problem on every build and was not
      // one. Off unless the project asked for it, either way.
      // Vite merges what a `config` hook returns into the project's own, so `pluginTimings` is
      // the only key this has to name.
      const userTimings =
        userConfig?.build?.rolldownOptions?.checks?.pluginTimings ??
        userConfig?.build?.rollupOptions?.checks?.pluginTimings;
      const checks = userTimings === undefined ? { checks: { pluginTimings: false } } : {};
      const pinned = (chunk: { name: string }): string => {
        // A coordinator is named `fudic-main-<hash of its own source>` (SDD-45 §4.4), so
        // this is a prefix and not an equality: there are as many as there are combinations of
        // pieces. The build id is appended as the LAST segment, which is the one `planRename`
        // replaces — the content hash in the middle survives it.
        if (chunk.name.startsWith(MAIN_ID)) return `${chunk.name}-${BUILD_TOKEN}.js`;
        if (chunk.name === 'fudic-boot') return bootFileName(BUILD_TOKEN);
        return 'assets/[name]-[hash].js';
      };
      // A chunk of a locale's graph carries its locale (SDD-74): with two locales and a library
      // with browser halves, each locale has its own root, and two `fudic-root.browser` are one
      // name once the build id replaces the hash (FUD0501) — one locale's page would load the
      // other's.
      const chunkName = (chunk: { readonly name: string; readonly moduleIds: readonly string[] }): string => {
        // A configured locale only: the query of a virtual id can carry more than its tag. And
        // not on a name that already says it — `h/<locale>/<tag>`, `index_locale_<locale>`.
        const locale = chunk.moduleIds.map(localeOf).find((l) => l !== undefined && locales.includes(l));
        const prefix = locale === undefined || chunk.name.split(/[/_.-]/u).includes(locale) ? '' : `${locale}-`;
        return `assets/${prefix}[name]-[hash].js`;
      };
      return {
        appType: 'custom',
        build: {
          ...baselineTarget(userConfig),
          rollupOptions: {
            // The coordinators are NOT inputs: there is one per combination of pieces and
            // they are emitted in `buildStart`, where the routes are known (SDD-45 §4.4).
            input: { 'fudic-boot': BOOT_ID },
            ...checks,
            ...(hasOutputConfig ? {} : { output: { entryFileNames: pinned, chunkFileNames: chunkName } }),
          },
        },
      };
    },

    configResolved(config) {
      root = config.root;
      base = config.base;
      logger = config.logger;
      reporter = new BuildReporter(root, { remember: config.command !== 'serve' });
      outDir = resolvePath(config.root, config.build.outDir);
      // Copied verbatim into the output, so a shell entry may legitimately point there
      // without ever appearing in the bundle (BUG-01 §4.4).
      publicDir = typeof config.publicDir === 'string' ? config.publicDir : '';
      // The registry knows it too, because a root-absolute `href` in a `.fud` names a file
      // of THIS directory: that is what makes it checkable, and what puts it in the shell.
      isDev = config.command === 'serve';
      // Forwarded to the Service Worker's nested build, which runs `configFile: false`.
      resolveAlias = config.resolve?.alias;
      // A nested build inherits the host's OUTPUT configuration; what it does not inherit
      // is a decision, not an oversight (BUG-05 §4.1). `build.sourcemap` was neither
      // applied nor reported: the option simply did nothing for these two outputs, and
      // `build.minify` did nothing for them either (BUG-06 §2.2) — the same hole, found
      // twice, which is why the list is now a type and not two ad-hoc fields.
      nested = { sourcemap: config.build.sourcemap, minify: config.build.minify, target: config.build.target };
      // `write: false` is a build that produces no files (tests, programmatic callers), so
      // the edge artifacts are not written either — they are still materialized for the
      // prerender, which needs them in a temp dir regardless.
      writeToDisk = config.build.write !== false;
      options = resolveOptions(userOptions, config.base).options;
      manifestUrl = options.manifestUrl;
      manifestFileName = manifestUrl.startsWith(base) ? manifestUrl.slice(base.length) : 'fudic-routes.json';
      // No `sw.json`, no Service Worker: everything is server/SSG (SDD-20 §4.7).
      const configIo = nodeConfigIo();
      swConfig = options.sw ? readSwConfig(root, configIo).config : null;
      // The workbench's app (SDD-82 §3.8): its pages and flows run with the Service Worker, as
      // `"dev": "preview"` serves it. Dev only, and only with the bench installed in the process.
      if (swConfig !== null && isDev && installedBench() !== undefined) swConfig = { ...swConfig, dev: 'preview' };
      benchBuild = (!isDev || previewing) && installedBench() !== undefined;
      // The bench's build must not overwrite the bundle the app's own preview serves.
      edgeDir = benchBuild ? join(resolvePath(root, config.build.outDir), '..', 'edge') : resolvePath(root, options.edgeDir);
      // Who this project is (SDD-41). Read here, next to `sw.json`, and reported in
      // `buildStart`, which is the first hook with a context to report through.
      project = readProject(root, swConfig !== null, configIo);
      // Its headers (SDD-84 §4.2): what the server, the worker and the manifest send.
      appHeaders = readAppHeaders();
      // Pruned copies are served from memory in dev, under a prefix no file of the project
      // can collide with (SDD-49 §4.8); a build publishes them beside every other asset. With
      // `css: "link"` the registry publishes every sheet of a page as a file (SDD-73 §3.5).
      linked = new LinkedAssets(
        config.base,
        publicDir,
        isDev ? DEV_SHEET_DIR : 'assets',
        project.config?.css === 'link',
      );
      api = new ApiProject(root);
      appId = project.config?.id ?? '';
      // Every app has a language (SDD-71 §3.1), also one without `fudic.json`: one language
      // has no prefix and no catalog, so its URLs are the ones it always had.
      locales = project.config?.locales ?? [DEFAULT_LOCALE];
      site = project.config?.site;
      // Dev re-reads the catalogs and the files on every compile: a save is seen without a
      // restart (§4.10, criterion 34). A build reads each once.
      catalogs = new Catalogs(root, locales, isDev);
      localeIos = new LocaleIos(catalogs, isDev);
      // The project's style guide (SDD-42), read here for the same reason the id is: it is
      // a property of the project, it is needed before anything is emitted, and every emit
      // path of the build has to be handed the SAME list — `edge`, `sw` and `ssg` producing
      // different stylesheets for one route is the difference nobody sees until a page
      // renders unstyled in exactly one shape.
      //
      // Read through the chain reader (SDD-43 §4.6), which answers per package: this
      // project's sheets are the ones below, and a component that comes from a library
      // adopts that library's chain instead. Its own diagnostics are this project's; the
      // libraries' are collected and reported in `buildStart` with the rest.
      const chains = new ProjectStyleChains(root, nodePackageFs());
      const resolvedStyles = chains.own(root);
      projectStyles = chains;
      styleChains = chains;
      styleErrors = resolvedStyles.errors;
      styleWarnings = resolvedStyles.warnings;
    },

    // A page is rendered by the server, so an edit in its SERVER graph — a route with no
    // `@client`, a layout, the `.ts` a `load` imports — has nobody to tell in the browser: Vite
    // logged «(ssr) page reload» to the SSR environment and the page stayed as it was (BUG-51).
    // The browser is told to reload, which is what that line always meant.
    hotUpdate(options) {
      // The implementations are registered by evaluating their modules, all of them, in order
      // (SDD-60 §4.4). A change anywhere may re-evaluate one of them — or the root — and leave
      // the others registered on contracts a fresh module no longer holds, so the next request
      // reloads every one.
      //
      // Only for a file the graph holds. A file it does not — a job of `@fudic/testing` written in
      // `.fudic/render` and deleted, an editor's backup — re-evaluates nothing, and invalidating
      // there emptied the contracts under a request already on its way: the page answered the
      // 404 of a `load` nobody implemented (the intermittent one of SDD-82 task 36).
      if (this.environment.name !== 'ssr' || options.modules.length === 0) return;
      invalidateImplementations(this.environment.moduleGraph);
      if (userOptions.serverReload === false) return;
      options.server.environments.client.hot.send({ type: 'full-reload', path: '*' });
    },

    async configureServer(server) {
      ({ routes: builds, errorPages } = discover());
      // The types of `fudic:<id>`, on disk before the editor or the live check asks (SDD-60
      // §3.11), and again whenever a `.fudapi` — or the `package.json` that lists the libraries
      // — changes. What was generated from the old text is stale in every graph: the modules,
      // and the `.fud` that link a file, whose names may have changed.
      api.writeDeclarations();
      const onApiFile = (file: string): void => {
        const path = slash(file);
        if (!path.endsWith(API_EXTENSION) && path !== `${slash(root)}/package.json`) return;
        api.invalidate();
        api.writeDeclarations();
        for (const environment of Object.values(server.environments)) {
          const graph = environment.moduleGraph;
          for (const mod of graph.idToModuleMap.values()) {
            const generated = mod.id?.startsWith(API_SCHEME) === true || mod.id?.startsWith(WRAPPER_PREFIX) === true;
            if (generated || mod.file?.endsWith('.fud') === true) graph.invalidateModule(mod);
          }
        }
        server.environments.client.hot.send({ type: 'full-reload', path: '*' });
      };
      server.watcher.on('add', onApiFile);
      server.watcher.on('change', onApiFile);
      server.watcher.on('unlink', onApiFile);
      // The three `.headers` (SDD-84 §4.5): a change is good for the next response, and what is
      // wrong in it is said at once. An error is logged, not thrown: the server stays up.
      const headersFiles = new Set(Object.values(HEADERS_FILES).map((file) => slash(join(root, file))));
      const onHeadersFile = (file: string): void => {
        if (!headersFiles.has(slash(file))) return;
        appHeaders = readAppHeaders();
        const log = server.config.logger;
        try {
          reporter.report(
            {
              warn: (entry) => log.warn(entry.message),
              error: (entry) => {
                throw entry;
              },
            },
            appHeaders.diagnostics,
          );
        } catch (error) {
          log.error((error as Error).message);
        }
      };
      // Vite already watches the root, where the three live.
      for (const event of ['add', 'change', 'unlink'] as const) server.watcher.on(event, onHeadersFile);
      // What the editor marks, live (SDD-35 §4.5): checked at start, re-checked on every save
      // of a file the program read, pushed to the overlay without a reload, and the page
      // comes back by itself once it is clean.
      //
      // In a child process (BUG-51): the first check builds the whole program, and in this
      // process it held `listen` for all of it. The machine that checks is imported here only
      // if the child dies — it loads TypeScript, most of a second, and `vite preview` loads this
      // plugin without ever checking anything.
      let live = NO_LIVE_CHECK;
      if (userOptions.liveCheck !== false) {
        const checker = resilientChecker(startLiveChecker(root), async () => {
          const { createProjectChecker } = await import('@fudic/typecheck');
          return createProjectChecker({ root });
        });
        const started = startLiveCheck(server, root, checker);
        server.httpServer?.once('close', () => {
          started.dispose();
          checker.dispose();
        });
        live = started;
      }
      // Dev serves the bootstraps at stable root URLs (so the SW would register at root
      // scope), but registers nothing unless `sw.json` says `"dev": "preview"` (§4.11).
      const scripts = new Map<string, string>([
        [devUrl(base, DEV_MAIN_URL), MAIN_ID],
        [devUrl(base, DEV_BOOT_URL), BOOT_ID],
        [devUrl(base, DEV_SW_URL), SW_ID],
        ...[...devMains()].map(([url, id]) => [devUrl(base, url), id] as const),
      ]);
      // Serving is `@fudic/server`'s (SDD-81 §3.10): dev is a `ServerApp` over the SSR graph,
      // with the hooks only dev has — the live check that refuses a page, the client Vite
      // injects, the overlay. The same `createServer` answers in preview and behind an adapter.
      //
      // The handler is loaded through the SSR graph and not imported here: the user's modules
      // reach `@fudic/http` and `@fudic/di` through that graph, and the request's container has
      // to be kept by the same `AsyncLocalStorage` they read.
      const devLoad = (pattern: string): Promise<RenderModule> =>
        server.ssrLoadModule(WRAPPER_PREFIX + pattern) as Promise<RenderModule>;
      // The routes of the last `routes()`, by pattern: what `prepare` checks the graph of.
      const devBuilds = new Map<string, RouteBuild>();
      // In an app with languages, the first locale's root: the one its pages load, so the
      // functions and the pages read and write the same modules (as the edge pass does).
      const rootId = locales.length < 2 ? SERVER_ROOT_ID : withLocale(SERVER_ROOT_ID, locales[0]!);
      const devApp: ServerApp = {
        base,
        locales,
        // `page.headers` without its CSP and HSTS (SDD-84 §4.5), read again when a file changes.
        get headers() {
          return devHeadersOf(manifestHeadersOf(appHeaders.config));
        },
        // Route discovery is cheap and dev adds/removes files: re-read on each request so a new
        // `.fud` is routable without restarting the server.
        routes: () => {
          ({ routes: builds, errorPages } = discover());
          devBuilds.clear();
          return builds
            .filter((rb) => rb.decision.mode !== 'excluded')
            .map((rb) => {
              devBuilds.set(rb.route.pattern, rb);
              return {
                pattern: rb.route.pattern,
                renders: true,
                // Known once its module is loaded: that is when its head was compiled (SDD-73 §4.1).
                hints: async () => {
                  await devLoad(rb.route.pattern);
                  return devHintsOf(rb);
                },
              };
            });
        },
        module: devLoad,
        errorPage: async (locale) => {
          const page = errorPageFor(errorPages, locale);
          return page === undefined ? null : { module: await devLoad(page.route.pattern), hints: devHintsOf(page) };
        },
        prerendered: () => Promise.resolve(null),
        // The functions of the `.fudapi` (SDD-60 §4.4): the root, loaded the first time a request
        // needs it, answers them. A root that cannot load goes to the overlay with its message.
        // Without a `.fudapi` there is no function to answer.
        functions: (fnOptions) => async (request) =>
          hasApi()
            ? ((await server.ssrLoadModule(rootId)) as { readonly handler: ContractsHandler }).handler(fnOptions)(request)
            : noFunction(),
      };
      const devServer = createServer(devApp, {
        dev: true,
        ...serveOptions(Boolean(server.config?.server?.https)),
        // What is not an `HttpError` is a bug of the app: to the overlay.
        onError: (error) => toOverlay(server, error),
        // A page whose graph has an error is not served (SDD-35 §4.5): the overlay goes in its
        // place, with the same position and message the editor shows. A check in flight is
        // waited for, so a save followed by a reload never sees the previous verdict.
        prepare: async (route) => {
          const rb = devBuilds.get(route.pattern);
          const blocked = rb === undefined ? undefined : await live.blocking(documentFiles(rb.absPath, io));
          if (blocked === undefined) return;
          const error = asError(blocked);
          server.ssrFixStacktrace(error);
          throw error;
        },
        // The dev client, injected by Vite. A streamed page shows Vite only its head, closed so
        // Vite can parse it; the body streams behind it untouched (SDD-70 §4.3).
        transformHtml: async (url, html, whole) => {
          if (whole) return server.transformIndexHtml(url, html);
          const head = await server.transformIndexHtml(url, `${html}</html>`);
          return head.slice(0, head.lastIndexOf('</html>'));
        },
      });
      // A request of a criterion of the workbench runs in its scope (SDD-82 §3.8): the server's
      // `Date` reads the criterion's clock. Without the bench installed, nothing changes.
      server.middlewares.use((req, _res, next) => {
        // A request without a criterion — or one a test hands in bare — is not the bench's.
        benchScope(criterionOfRequest((req.headers as IncomingMessage['headers'] | undefined)?.cookie), next);
      });
      // Functions, remote rules and the CSRF token, with any method, before anything else gets
      // a turn.
      const devFunctions = nodeMiddleware(devServer);
      server.middlewares.use((req, res, next) => {
        if (isFnPath(pathnameOf(req.url ?? '/', '/'), base)) devFunctions(req, res, next);
        else next();
      });
      // The files a `.fud` links, at the SAME URL the build publishes them under (BUG-40).
      // Dev has no bundle to put them in, and a page that works built and 404s in dev — or
      // the other way round — is the kind of difference that is found last.
      server.middlewares.use((req, res, next) => {
        const asset = linked.served((req.url ?? '').split('?')[0] ?? '');
        if (asset === undefined) {
          next();
          return;
        }
        res.setHeader('Content-Type', asset.type);
        res.end(asset.bytes);
      });
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0] ?? '';
        if (url === manifestUrl) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(devManifest(builds, 'dev', '/', devHeadersOf(manifestHeadersOf(appHeaders.config)))));
          return;
        }
        // The two bootstraps, and every component's client module (SDD-17 §4.7.1). The
        // last one has no file behind it in dev: `<path>.fud?client` is an id the module
        // graph knows and nothing publishes, so without this the URL `resolveChunk`
        // hands the runtime would be a 404 and dev could not hydrate at all.
        const id = scripts.get(url) ?? devClientModuleId(pathnameOf(url, base));
        if (id === undefined) {
          next();
          return;
        }
        server
          .transformRequest(id)
          .then((result) => {
            res.setHeader('Content-Type', 'text/javascript');
            if (id === SW_ID) {
              // `sw.headers` (SDD-84 §4.3), then the two that are fudic's: the scope, and no cache.
              for (const [name, value] of Object.entries(manifestHeadersOf(appHeaders.config).sw)) res.setHeader(name, value);
              res.setHeader('Service-Worker-Allowed', base); // root scope
            }
            res.setHeader('Cache-Control', 'no-cache'); // these two govern updates
            // WITH its map. `transformRequest` hands back both halves and this middleware
            // used to write only the first, so nothing fudic emits was debuggable in dev.
            res.end(result === null ? '' : withInlineSourceMap(result.code, result.map));
          })
          // To Vite's error middleware, which puts it in the overlay like the HTML's own
          // (SDD-35 §4.5). A `500` with a comment in it was an error nobody saw: the browser
          // loaded a script that did nothing.
          .catch((err: Error) => {
            next(err);
          });
      });

      // The dev server IS the edge (§4.11): data endpoints, on-demand navigation rendering and,
      // for what nothing answered, `_error.fud` as a `404` (SDD-73 §4.3). Registered with `post`
      // so it runs after Vite's own middlewares, and every file Vite serves is served first.
      return () => {
        server.middlewares.use(nodeMiddleware(devServer, { notFound: true }));
      };
    },

    configurePreviewServer(server) {
      // Preview is the production edge, and it runs exactly what an adapter runs: the
      // `server.mjs` the build left beside the edge chunks, given to `createServer` with the
      // prerendered pages of `outDir` (SDD-81 §3.10). What a static host serves, Vite serves.
      const serverFile = join(edgeDir, SERVER_FILE);
      let mounted: Promise<FudicServer | null> | undefined;
      const fudicServer = (): Promise<FudicServer | null> =>
        (mounted ??= !existsSync(serverFile)
          ? Promise.resolve(null)
          : (import(pathToFileURL(serverFile).href) as Promise<BuiltServer>).then(({ createApp, config, bench }) =>
              createServer(createApp({ prerendered: staticPages(outDir) }), {
                ...serveOptions(Boolean(server.config?.preview?.https), config),
                // The workbench's own build, served by the workbench (SDD-82 §4.7).
                ...(bench === true && benchBuild ? { bench: true } : {}),
                // Preview is a local check: without `FUDIC_SECRET` it signs with one of its own
                // (SDD-81 §8.2.10). An adapter in production is given one.
                secret: process.env['FUDIC_SECRET'] ?? randomUUID(),
              }),
            ));
      const mount = (notFound: boolean) => (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void): void => {
        fudicServer()
          .then((fudic) => (fudic === null ? next() : nodeMiddleware(fudic, { notFound })(req, res, next)))
          .catch(next);
      };
      // A request of a criterion runs in its scope, as in dev: the server's `Date` reads its clock.
      if (benchBuild) {
        server.middlewares.use((req, _res, next) => {
          benchScope(criterionOfRequest((req.headers as IncomingMessage['headers'] | undefined)?.cookie), next);
        });
      }
      server.middlewares.use(mount(false));
      // No route and no file: `_error.fud` as a `404` (SDD-73 §4.3). After Vite's own
      // middlewares, so everything `dist` holds is still served as a file.
      return () => {
        server.middlewares.use(mount(true));
      };
    },

    async buildStart() {
      // Nothing of a previous build's check survives into this one.
      verdict = undefined;
      runningCheck = undefined;
      // A new memory per build: a watch rebuild must not answer with the previous graphs.
      if (!isDev) io = buildIo(nodeIo((path) => api.linked(path)));
      // The contracts as this build reads them, and their types on disk before the background
      // typecheck reads `.fudic/api` (SDD-60 §3.11). What a `.fudapi` or a `.fudspec` of the app
      // says that is wrong is the typecheck's to report, once, with the rest: it stops the build
      // as a `.fud` that does not parse does.
      api = new ApiProject(root);
      api.writeDeclarations();
      // What the editor marks, before anything is compiled (SDD-35 §4.4). The whole project,
      // and not only what a route reaches: a component nobody links yet is red in the editor
      // too. Every problem is printed, and the build fails ONCE with the count — the author
      // sees the whole list in the first run. Dev has its own live check (§4.5).
      //
      // In a child process, WHILE the build bundles (`startBackgroundCheck`): it used to block
      // here for one to two seconds before anything was compiled. The verdict is still the
      // first thing the build says — `report` waits for it before any batch that has something
      // to say, and `buildEnd` before the build is allowed to finish.
      if (!isDev) {
        const check = startBackgroundCheck(root);
        runningCheck = check;
        verdict = check.report.then((report) => {
          reporter.rememberCheck(report);
          const summary = summarize(report, root);
          for (const block of summary.blocks) {
            if (block.severity === 'error') logger?.error(block.text);
            else logger?.warn(block.text);
          }
          return summary.failure;
        });
        // Handled here so a check that fails before anyone awaits is not an unhandled
        // rejection; `settleCheck` still receives the error.
        verdict.catch(() => undefined);
      }
      // Who this project is, before anything is built with it. A malformed `fudic.json`
      // stops here, as it does in the CLI (`FUD0725`); so does a `sw.json` with no `id`,
      // because caches named after nothing is not a degraded mode (§5).
      //
      // Every batch of `buildStart` goes through `report`, which lets the typecheck speak first.
      await report(this, project.errors);
      // The three `.headers` (SDD-84 §4.2): an error in one stops the build, and the file is never
      // replaced by its template — whoever wrote it believes they changed something.
      await report(this, appHeaders.diagnostics);
      // The head of every page of an app in two or more languages carries absolute URLs
      // (SDD-58 §4.7), and a prerendered page has no request to take the origin from.
      if (!isDev && locales.length >= 2 && site === undefined) {
        await report(this, [FUD1027()]);
      }
      // The style guide's own (SDD-42 §5). Errors, and for the same reason: a sheet that is
      // not there renders exactly like a sheet that did nothing.
      await report(this, styleErrors);
      // And the same questions asked of the LIBRARIES this project consumes (SDD-43 §4.6).
      // Reading the whole chain here, before anything is emitted, is what makes this one
      // report naming the package instead of one per document that happens to compose a
      // component from it.
      if (styleChains !== null) {
        styleChains.chainOfPackage(root);
        guidedSheets = new Set([...styleChains.guidedSheets(root)].map((s) => `fudic.json "${s}"`));
        await report(this, styleChains.diagnostics);
      }
      // The published runtime this build links instead of compiling (SDD-45 §4.2). Discovered
      // here, before anything resolves an import: from `buildStart` on, `@fudic/core` is a set
      // of URLs and not a package to bundle.
      //
      // Not in dev (§4.15): there the runtime comes out of Vite's module graph, unversioned
      // and hot-reloadable, and an empty linkage is exactly the instruction to bundle it.
      if (!isDev) {
        const discovery = runtimePieces(root, runtimeFs);
        await report(this, discovery.diagnostics);
        runtime = runtimeLinkage(discovery.pieces, runtimeFs);
      }
      // Whether each library can be parsed by THIS compiler (SDD-43 §4.7). An ERROR since
      // SDD-45 §4.8, once per library: it was a warning while every app of a repository was
      // on one version by force, and this SDD makes an application's version its own. The
      // moment a library is shared between two of them, the library decides — and what a
      // mismatch produces is an export that does not exist, in a browser, inside a file the
      // author never wrote.
      await report(this, checkPeers(root, nodePackageFs()));
      // And what the sheet says that its destination cannot hear (§4.5). A warning, and
      // the sheet is emitted whole: the same file served to the document too is a legitimate
      // shape, and there those rules are the correct ones.
      await report(this, styleWarnings);

      const discovered = discover();
      builds = discovered.routes;
      errorPages = discovered.errorPages;
      // With the severity each one has in a build: an error said as a warning is a build that
      // lies (SDD-35 §1.2). And what parsing the routes said, which used to be dropped (§1.1):
      // the typecheck already said it, so the reporter stays quiet about it.
      //
      // In dev, warnings as before: a dev server does not die on a typo at startup, and the
      // parse errors are the live check's to show, in the overlay (§4.5).
      if (!isDev) {
        await report(this, discovered.diagnostics);
        await report(this, discovered.parse);
      } else {
        for (const d of discovered.diagnostics) this.warn(reportText(d, root));
      }

      // What the links NAME, before anything walks them (SDD-43 §4.3). The graph walk reads
      // every file it reaches and stops at the first one it cannot, with an `ENOENT` naming
      // a path the author never wrote — so the questions only a resolver can answer are
      // asked here, where there is still something to say about them.
      await report(
        this,
        checkLinks(
          builds.map((rb) => rb.absPath),
          linkCheckIo,
        ),
      );

      // The coordinators (SDD-45 §4.4): one per route, named by its content, so two routes
      // that need the same pieces produce the same file and a route with nothing to hydrate
      // produces none at all.
      //
      // Here, in `buildStart`, because three passes render the same route — this plugin, the
      // link pass and the edge pass — and a route whose head named a different module in each
      // would be a page that disagrees with itself depending on who rendered it.
      coordinators = new Map();
      eagerByPattern = new Map();
      coordinatorIds.clear();
      if (!isDev) {
        const { missing } = coordinatorParams({ mode: 'build', base });
        await report(this, missing.map((name) => FUD0801({ name })));
        for (const rb of builds) {
          if (rb.decision.mode === 'excluded') continue;
          // A locale's coordinator resolves its chunks under the locale's directory (SDD-58).
          const dir = chunkDir(rb.locale, locales);
          const { params } = coordinatorParams({ mode: 'build', base, ...(dir === '' ? {} : { dir }) });
          const coordinator = coordinatorFor(
            {
              hydrates: routeHydrates(rb.absPath, io),
              injects: routeUsesDi(rb.absPath, io),
              parted: routeInParts(rb.absPath, io),
              // Only read with no worker: then the coordinator carries their graph.
              warms: routeWarmTags(rb.absPath, io, rb.route.pattern).map((tag) => `${dir}${tag}`),
            },
            params,
          );
          coordinators.set(rb.route.pattern, coordinator);
          if (coordinator !== null && swConfig === null) {
            const eager = routeEagerTags(rb.absPath, io, rb.route.pattern);
            if (eager.length > 0) eagerByPattern.set(rb.route.pattern, eager.map((tag) => `${dir}${tag}`));
          }
          if (coordinator === null || coordinatorIds.has(coordinator.source)) continue;
          // One emit per distinct SOURCE: that is what makes «same needs, same file» a
          // property of the build rather than something to check afterwards.
          const id = `${COORD_PREFIX}${coordinator.name}`;
          coordinatorIds.set(coordinator.source, id);
          coordinatorSources.set(id, coordinator.source);
          // Its file name is PINNED rather than left to the output naming: the head writes
          // it as `<base><name>-<id>.js` at the root of the output, and a chunk that landed
          // under `assets/` instead would be a tag pointing at a file nobody wrote. The token
          // is the last segment, so `planRename` swaps it for the build id like every other.
          this.emitFile({
            type: 'chunk',
            id,
            fileName: `${coordinator.name}-${BUILD_TOKEN}.js`,
          });
        }
      }

      // FUD0742, and it is the BUILD's rather than the emit's because what it is about is
      // the PROJECT: a sheet that nothing adopts. The emit sees one file at a time, so the
      // same fact stated there would be one warning per route for a single mistake.
      // THIS project's own sheets, not the chain's: a library's guide is adopted by the
      // library's own components, and whether this project defines any says nothing about it.
      // Nor a sheet its style guide imports (SDD-79): that one reaches every page through the
      // guide, and a project just created has no component yet.
      // Nor with no route at all: the components a project defines are found through the
      // routes that link them, so with none the answer is unknown, not "none". That is the
      // workbench opening a flow, whose pages are written after Vite starts — and under
      // `"warnings": "error"` (SDD-83) a false warning there stopped the server.
      if (
        builds.length > 0 &&
        styleChains !== null &&
        ownSheets(styleChains, root) > 0 &&
        discoverComponents(builds, io).length === 0
      ) {
        await report(this, [FUD0742()]);
      }
      if (isDev) {
        // Dev has no emitFile/generateBundle: the module graph serves the wrappers and
        // bootstraps, and configureServer serves the manifest.
        return;
      }

      // One chunk per route, and it is the CLIENT-SAFE variant (BUG-09 §4.1): `load` and
      // the `@server` graph now live only in the edge pass, outside `outDir`.
      //
      // The chunk itself stays, and not for the render: it is what pulls each page and its
      // components into the client graph, which is how the linked assets of §4.5 get
      // emitted and hashed. Drop it and a page's `<img>` points at a file the build never
      // produced.
      for (const rb of builds) {
        if (rb.decision.mode === 'excluded') {
          continue;
        }
        this.emitFile({
          type: 'chunk',
          id: WRAPPER_PREFIX + rb.route.pattern,
          name: `${PAGE_NAME_PREFIX}/${safeName(rb.route.pattern)}`,
          // Imported at runtime through the manifest, not via a static import Rollup
          // can see — keep its exports.
          preserveSignature: 'strict',
        });
      }

      // One client chunk per component of the graph, with no level filter (SDD-15 §6.8).
      // Which of them ends up hydrating is decided where rendering happens — the edge at
      // request time, the Service Worker at navigation time — and always with data in hand.
      // Nothing here can know it, so everything is emitted; a chunk nobody requests costs
      // nothing, and one that is missing cannot be invented at run time.
      //
      // Once per locale when the app has them (SDD-58 §4.6): a chunk compiled for `en`, under
      // `en/` when there are two or more — so the client of `/en/…` gets only `en`'s.
      // One locale tags nothing (SDD-71): its chunks are the untagged ones, compiled for it.
      const chunkLocales: readonly (string | undefined)[] = locales.length < 2 ? [undefined] : locales;
      const localized = (id: string, locale: string | undefined): string =>
        locale === undefined ? id : withLocale(id, locale);
      for (const locale of chunkLocales) {
        const dir = chunkDir(locale, locales);
        for (const comp of discoverComponents(builds, io)) {
          this.emitFile({
            type: 'chunk',
            id: localized(clientId(comp.path), locale),
            name: clientChunkName(dir + comp.tag),
            // Loaded by URL for its side effect (`customElements.define`), never imported by
            // a module Rollup can see: nothing may be dropped for looking unused.
            preserveSignature: 'strict',
          });
          // And its IoC module, when it declares a provider (SDD-38 §4.5). A separate file
          // because its owner may be N1: a component that only provides never hydrates and
          // never downloads its chunk, and its factory still has to reach the browser.
          if (comp.owns) {
            this.emitFile({
              type: 'chunk',
              id: localized(iocId(comp.path), locale),
              name: iocChunkName(dir + comp.tag),
              preserveSignature: 'strict',
            });
          }
        }
      }

      // And one per REACTIVE route (SDD-39 §3.5). Same directory and same arithmetic as a
      // component's, because the runtime derives both URLs through one `resolveChunk` — what
      // it is handed is a name, and `hydrateUrl` does not care where the name came from.
      //
      // A route IS filtered, unlike a component, and the asymmetry is the level rule: nobody
      // hands a route a prop, so what it says about itself is the whole answer.
      const tags = new Set(discoverComponents(builds, io).map((c) => c.tag));
      const reactiveRoutes = discoverReactiveRoutes(builds, io);
      // Two files that would be written to one name (§3.5). A pattern does not normally
      // produce a valid tag — `blog-slug` has no reason to be anybody's element — but
      // «normally» is not a guarantee, and a silent overwrite is a page that hydrates as
      // some other file. Every clash at once, before anything is emitted for them.
      await report(
        this,
        reactiveRoutes
          .filter((route) => tags.has(route.name))
          .map((route) => FUD0622({ pattern: route.pattern, name: route.name })),
      );
      for (const route of reactiveRoutes) {
        this.emitFile({
          type: 'chunk',
          id: route.locale === undefined ? clientId(route.path) : withLocale(clientId(route.path), route.locale),
          name: clientChunkName(chunkDir(route.locale, locales) + route.name),
          preserveSignature: 'strict',
        });
      }
    },

    resolveId(id, importer) {
      if (
        id === MAIN_ID ||
        id.startsWith(`${MAIN_ID}?`) ||
        id === BOOT_ID ||
        id === SW_ID ||
        id.startsWith(WRAPPER_PREFIX) ||
        id.startsWith(COORD_PREFIX)
      ) {
        return id;
      }
      if (id.startsWith(RUNTIME_SHIM)) {
        return id;
      }
      // A generated contract and the two roots (SDD-60 §3.11, §4.4): claimed only when the
      // project has that `<id>`, so a `fudic:` nobody declared stays an unresolved import.
      // A root resolves to a FILE id inside the project, never written to disk: its
      // `import.meta.glob` is relative to where its importer lives, and a bare `fudic:` has no
      // folder for Vite's dev server to read the app's folders from.
      //
      // Compiled for a locale like any module of the app (SDD-58 §4.6): a module of a locale's
      // graph hands it on, so each locale has its root, its contracts and its handlers, where
      // `t` and `locale` are that locale's (SDD-60 §4.4, *decided while implementing*).
      const generated = generatedId(idWithoutLocale(id));
      if (generated !== undefined) {
        const locale = localeOf(id) ?? (importer === undefined ? undefined : localeOf(importer));
        return locale === undefined ? generated : withLocale(generated, locale);
      }
      // A published piece, named by a shim or by a coordinator: it leaves as the URL it is.
      // `'absolute'` and not a plain `true`, or an id starting with `/` is read as a
      // filesystem path and renormalized against the output directory — which would turn an
      // origin-absolute URL into `../../…` and put the runtime back inside the app's `base`.
      if (runtime.byUrl.has(id)) {
        return { id, external: 'absolute', moduleSideEffects: false };
      }
      // A runtime package stops being a package and becomes a set of URLs (SDD-45 §4.2). The
      // shim is what splits one import across the pieces that answer it — a resolver is handed
      // the specifier and never the names — and it falls back to the real module for whatever
      // that package does not publish, which is how `@fudic/transport` keeps working while
      // only `urls` has a URL (§4.10).
      // A render wrapper is the WORKER's code, not the page's (SDD-45 §4.10): its imports are
      // resolved by the linker the worker carries — `@fudic/ssr` arrives as a builtin — and
      // not by a URL a browser fetches. Moving those to the published runtime is SDD-45's
      // phase 7, through the Store the worker already uses, and doing it here instead would
      // hand the linker a specifier it has no way to answer.
      const forTheWorker = importer?.startsWith(WRAPPER_PREFIX) ?? false;
      // And the shim's OWN star re-export of the same specifier, which is how the part a
      // package does not publish still reaches its real file: left alone here, it is resolved
      // by whoever resolves packages. Without this it would come straight back.
      const fromTheShim = importer?.startsWith(RUNTIME_SHIM) ?? false;
      if (
        !forTheWorker &&
        !fromTheShim &&
        // And a publisher's own internal imports, which are not the application's boundary.
        !insidePublisher(importer, runtime, id) &&
        publisherOf(id, runtime.packages) !== null
      ) {
        // Per importer, so it is never a shared chunk: see `shimIdFor`.
        return shimIdFor(id, importer);
      }
      // A module compiled for a locale hands it on (SDD-58 §4.6): every `.fud`, and every
      // `.ts`/`.js` of the project outside `node_modules`, is that locale's module too. A
      // compiled npm dependency is not, and is shared by every locale.
      const handed = handedOn(id, importer);
      if (handed !== undefined) return resolveForLocale((i, from, o) => this.resolve(i, from, o), id, handed, root, implementationDirs());
      // Only in dev: in build these names are real emitted files (see `DEV_SCRIPT_IDS`).
      if (isDev) {
        const path = pathnameOf(id, base);
        return DEV_SCRIPT_IDS.get(path) ?? devMains().get(path) ?? devClientModuleId(path) ?? null;
      }
      return null;
    },

    load(id, loadOptions) {
      if (id.startsWith(RUNTIME_SHIM)) {
        const specifier = shimSpecifier(id);
        const pkg = publisherOf(specifier, runtime.packages);
        // Answered in `resolveId` before this id existed, so the lookup cannot miss.
        return pkg === null ? null : runtimeShim(pkg, runtime, specifier);
      }
      if (id.startsWith(COORD_PREFIX)) {
        // Written in `buildStart`, before this id existed, so the lookup cannot miss.
        return coordinatorSources.get(id) ?? null;
      }
      // The side is the environment's: the dev server's SSR graph and the edge pass are the
      // server, everything a browser downloads is the browser (SDD-60 §3.11).
      const side = loadOptions?.ssr === true ? 'server' : 'browser';
      const bare = idWithoutLocale(id);
      if (bare === rootFile('server') || bare === rootFile('browser')) {
        return rootSource(bare === rootFile('server') ? 'server' : 'browser');
      }
      if (bare.startsWith(API_SCHEME) && api.source(bare.slice(API_SCHEME.length)) !== undefined) {
        // Every `.fudapi` of the project is an input: a type or a middleware of another file
        // changes this one's text.
        for (const source of api.sources) this.addWatchFile(source.path);
        return apiModule(bare.slice(API_SCHEME.length), side, localeOf(id)) ?? null;
      }
      if (id === MAIN_ID || id.startsWith(`${MAIN_ID}?`)) {
        const dir = chunkDir(localeOf(id), locales);
        // DEV's coordinator, and there is ONE for the whole application (SDD-45 §4.15): dev
        // builds nothing and optimises nothing, what it needs is a URL that does not move
        // between reloads. So the question is the app's — if no component anywhere writes a
        // DI call, the module does not name the injector and nothing of it is served.
        //
        // The same generator as a build's, which is the point: the startup has one shape in
        // both places, and dev and build do not become two programs.
        const { params } = coordinatorParams(
          isDev
            ? { mode: 'dev', urlPrefix: devClientPrefix(base) + dir }
            : { mode: 'build', base, ...(dir === '' ? {} : { dir }) },
        );
        const coordinator = coordinatorFor(
          {
            hydrates: true,
            injects: discoverComponents(builds, io).some((c) => c.usesDi),
            // One coordinator for every page in dev: it reads parts when any route has them. On
            // a page without, the reader finds no marker and the end blocks are read as ever.
            parted: builds.some((rb) => routeInParts(rb.absPath, io)),
          },
          params,
        );
        // `hydrates: true` above, so there is always one: in dev the tag is served at a fixed
        // URL for every page, and which pages hydrate is still the head's decision.
        return coordinator === null ? null : coordinator.source;
      }
      if (id === BOOT_ID) {
        // The half that is loaded unconditionally (BUG-31 §T2), so it carries the one thing
        // that must happen on every page: registering the worker. Empty when there is none.
        const hasWorker = swConfig !== null && (!isDev || swConfig.dev === 'preview');
        return emitBootBootstrap(
          hasWorker ? JSON.stringify(devUrl(base, DEV_SW_URL)) : null,
          // Nothing to report in dev: there the runtime is not published and its URLs are
          // the dev server's (§4.15).
          isDev ? '' : `/${RUNTIME_DIR}/`,
        );
      }
      if (id === SW_ID) {
        return emitSwBootstrap({
          manifestUrlExpr: JSON.stringify(manifestUrl),
          shell: swConfig?.shell ?? [],
          resources: swConfig?.resources ?? [],
          // From the project's `fudic.json`, never from a plugin option: the identity of an
          // application belongs to the project (SDD-41 §3.3).
          app: appId,
          // Nothing in DEV (§4.15): there the runtime comes out of Vite's module graph, at
          // URLs that are not `/_fudic/…` and that must not be cached at all — a cached
          // runtime in dev is a hot reload that does not arrive.
          runtimePrefix: isDev ? '' : `/${RUNTIME_DIR}/`,
          runtimeCache: isDev ? '' : runtimeCacheOf(runtime),
          runtimeCachePrefix: isDev ? '' : RUNTIME_CACHE_PREFIX,
          runtimeMarker: isDev ? '' : runtimeMarkerUrl(appId),
          // In dev the renderer comes out of Vite's module graph like everything else
          // (§4.15); there is nothing published to link.
          renderer: isDev ? '' : (pieceUrl(runtime, '@fudic/ssr', 'index') ?? ''),
        });
      }
      if (id.startsWith(WRAPPER_PREFIX)) {
        const pattern = id.slice(WRAPPER_PREFIX.length);
        // `_error.fud` too, rendered like a route but never named by the route table.
        const rb = [...builds, ...errorPages].find(
          (b) => b.route.pattern === pattern,
        );
        if (rb === undefined) {
          return null;
        }
        return emitRenderChunk({
          pageModule: pageModuleOf(rb),
          hasDi: routeUsesDi(rb.absPath, io),
          ...routeApi(rb, SERVER_ROOT_ID, isDev),
          ...(rb.analysis.buffer !== undefined ? { buffer: rb.analysis.buffer } : {}),
          // In dev the origin is the request's: a page served at localhost links to localhost.
          ...alternatesOf(rb, locales, base, isDev ? undefined : site),
          // In DEV this module IS the edge: the dev server renders through the module
          // graph and resolves data in process. In BUILD it is a chunk of the client
          // output, and the client never gets `load` (BUG-09 §4.1) — the edge pass builds
          // the variant that does, outside `outDir`.
          withLoad: isDev,
          // The workbench's services in the request's root (SDD-82 §4.2): only dev serves it.
          bench: isDev,
          // Dev has no build and no id: the two entries are served at their stable URLs,
          // there is nothing to preload — the dev server hands the runtime out of the module
          // graph — and nothing to embed, so a layout that asks for `?inline` keeps the file
          // form there. That is §4.15: development does not change.
          runtime: isDev
            ? {
                boot: devBootUrl(),
                main: devMainUrl(rb.locale),
                pieces: [],
                inline: '',
              }
            : runtimeEntriesFor(pattern),
        });
      }
      // Nothing of ours: if the module is a built `dist/*.js` that ships its own map, hand
      // the map over with it so the chain reaches the `.ts`. `@fudic/core`'s `signal.js` is
      // the case that made this visible — the debugger showed the compiled JavaScript for a
      // file whose TypeScript was on disk, with its map, all along.
      // Nothing of the server reaches it to blank: the browser never loads `src/server` nor a
      // package's `server/` (SDD-60 §4.4).
      return loadWithSourceMap(id);
    },

    async transform(code, id) {
      // A runtime shim is this plugin's own generated module (SDD-45 §4.2), not a file: it has
      // no `.fud` to compile and nothing to translate.
      if (id.startsWith(RUNTIME_SHIM)) return null;
      const split = splitId(id);
      const path = split.path;
      // The locale a module is compiled for travels in its query (SDD-58 §4.6); what the rest
      // of this hook dispatches on is the query without it.
      const locale = localeOf(id);
      const query = locale === undefined ? split.query : withoutLocale(split.query);
      // A module's catalog file is one of its inputs: saving it recompiles the module (§4.10).
      // Only one that exists: Vite's dev server takes a watched file for an import of the
      // module, and one that is not there — the language of the code has none — broke the page.
      const catalog = locale === undefined ? undefined : catalogFileOf(root, locale, path);
      if (catalog !== undefined && existsSync(catalog)) this.addWatchFile(catalog);
      if (!path.endsWith('.fud')) {
        const script = /\.[cm]?[jt]sx?$/u.test(path);
        // A module of the app compiled for a locale: `t`, `format` and `locale` replaced. Untagged,
        // it is the one locale's when the app has one, if it is a module of the project that
        // imports a name to replace.
        const forLocale =
          locale !== undefined ||
          (soleLocale(locales) !== undefined && mayLocalize(code) && compilesPerLocale(path, root, implementationDirs()));
        const translated =
          forLocale && script ? translateScript(code, path, compileFor(locale)!).value : undefined;
        // Nothing to replace leaves the module as it arrived, map and all: a second, identical
        // version of one file is two versions to whoever keeps them apart (coverage, a debugger).
        return translated === undefined || translated.code === code
          ? null
          : { code: translated.code, map: JSON.stringify(translated.map) };
      }
      const fudIo = ioFor(locale);
      if (query === IOC_QUERY) {
        const ioc = transformFudIoc(path, fudIo);
        if (ioc === null) return null;
        // What resolving its graph had to say, which this path used to drop (SDD-35 §1.1).
        await report(this, ioc.diagnostics, path);
        // The `@code` is copied verbatim, so this module is TypeScript whenever the author
        // wrote TypeScript — the same strip `?client` needs.
        return (await transformWithOxc(ioc.code, `${path}.ts`, { lang: 'ts' })).code;
      }
      if (query === CLIENT_QUERY) {
        const chunk = transformFudClient(path, fudIo, projectStyles, linked, sourceLabel());
        if (chunk === null) {
          return null;
        }
        // Every diagnostic of the chunk, positioned, and none of them twice (SDD-35 §4.4):
        // this path used to drop the emit's own, so a `@client` that did not compile shipped.
        await report(this, [
          ...chunk.missingAssets.map((spec) => FUD0363({ file: path, spec })),
          ...chunk.diagnostics,
        ], path);
        // Same reason as `?ioc`: the `@code` is copied VERBATIM, so
        // the chunk is TypeScript whenever the author wrote TypeScript. The emit's map goes
        // IN as `inMap`, so what comes out is `.fud` → JS in one map instead of Oxc's
        // TS → JS. Without it the chunk mapped to a source it called `app-badge.fud?client`
        // whose `sourcesContent` was the GENERATED module: aligned, and about a file the
        // author never wrote.
        const stripped = await transformWithOxc(
          chunk.code,
          `${path}.ts`,
          { lang: 'ts', sourcemap: true },
          chunk.map,
        );
        return stripped.map ? { code: stripped.code, map: stripped.map } : { code: stripped.code };
      }
      // The route's own name, when this `.fud` IS a built route: it is what the page
      // publishes in `fud-route` and what the runtime derives the chunk URL from (SDD-39
      // §4.7). A component, a layout, or a route the build excluded gets none, and then the
      // page publishes no block and claims no id.
      //
      // Compiled through the build's memory (`compileFud`): the link pass and the edge pass
      // ask for the same module later and get this one instead of compiling it again.
      const compiled = await compileFud(
        path,
        fudIo,
        routeNameOf(path, locale),
        projectStyles,
        linked,
        compileFor(locale),
        sourceLabel(),
      );
      if (compiled === null) {
        return null;
      }
      const result = compiled.result;
      if (result.hints !== undefined) pageHints.set(pageHintKey(path, locale), result.hints);
      // What its emit put in the page that a CSP has to let in: the build checks them all at
      // once in `generateBundle`; dev, page by page, as each one is compiled (SDD-84 §4.2).
      pageNeeds.set(pageHintKey(path, locale), result.needs);
      if (isDev) {
        writeCspNeeds(root, emittedNeeds());
        await report(this, checkEmitted(appHeaders, { page: result.needs }).filter((d) => d.severity !== 'hint'));
      }
      // A literal asset URL with no file on disk: warn (FUD0363) and keep the literal —
      // the emit already left it un-linked, so the build does not abort.
      const diagnostics: FudDiagnostic[] = result.missingAssets.map((spec) => FUD0363({ file: path, spec }));
      // The inline form against the policy this application ships (SDD-45 §4.5.2). An error
      // rather than a warning because the page it would produce renders and does not
      // hydrate: the browser drops the module and nothing connects that silence to the line
      // that caused it.
      //
      // The policy is the app's `page.headers` (SDD-84 §3.4); a page without a CSP lets it in.
      const pageCsp = pageCspOf(manifestHeadersOf(appHeaders.config));
      if (result.inlineRuntime !== undefined && pageCsp !== undefined && !policyDeclaresNonce(pageCsp)) {
        diagnostics.push(
          FUD0803({
            file: result.inlineRuntime.file,
            specifier: `${RUNTIME_MARKER}?${INLINE_QUERY}`,
            offset: result.inlineRuntime.offset,
          }),
        );
      }
      // The `.fud` this module's markup came from that Vite cannot see: a snippet file is
      // not imported by the emitted code, it is expanded INTO it (SDD-29 §4.10), so without
      // this an edit to it would rebuild nothing.
      for (const file of result.watchFiles ?? []) this.addWatchFile(file);
      // The emit's own diagnostics — layout chain (SDD-21), contract, injection, adopted
      // styles — with the ones above, ALL of them and positioned (SDD-35 §4.4): the warnings,
      // then every error of this file in one failure. A diagnostic that names another file
      // says so: a snippet's body is reported in the snippet's file. What the typecheck
      // already said is not said again.
      await report(this, [...diagnostics, ...result.diagnostics], path);
      // Already stripped, for the same reason as `?ioc` and `?client`: since SDD-34 the
      // neutral zone of `@code` reaches this module verbatim, so a `const f: Form<Post> =
      // form(schema)` makes it TypeScript. The `.fud` map went IN as `inMap`, so the map
      // describes the code actually returned — it used to be handed over next to the
      // STRIPPED code, a map of a text that no longer existed.
      return compiled.module;
    },

    async buildEnd(error) {
      // The last moment the typecheck can stop the build before anything is written: the
      // bundle is done, the link and edge passes and the prerender have not started.
      const check = runningCheck;
      runningCheck = undefined;
      if (error !== undefined) {
        // The build already failed for a reason of its own; nobody will read the verdict.
        await check?.cancel();
        return;
      }
      await settleCheck(this);
    },

    async generateBundle(_outputOptions, bundle) {
      // Every file name this build produces. The declared `shell` is checked against it
      // at the end: an entry that does not exist is a BUILD diagnostic (BUG-01 §4.4),
      // not something to swallow in the install's `catch` on the client.
      const emitted = new Set<string>(Object.keys(bundle));

      // 1 and 1b run AT THE SAME TIME: two independent nested builds over the same routes.
      // Neither reads the other's output, both compile through the build's memory, and the
      // reporter they share says each diagnostic once whoever finds it first. They used to
      // run one after the other.
      //
      // 1. The link pass: the chunks the Service Worker will link by hand (§4.3).
      const linking: Promise<LinkResult> =
        swConfig === null
          ? Promise.resolve({ chunks: [], entries: new Map(), deps: new Map() })
          : runLinkPass(
              root,
              base,
              builds,
              io,
              nested,
              projectStyles,
              linked,
              runtimeEntriesFor,
              reporter,
              localeContext(),
              // Any generated module, a library's pipe included (SDD-71 §4.5): not only when the
              // app declares a `.fudapi` of its own.
              api.sources.length > 0 ? browserApi : undefined,
            );
      // A nested build's output is emitted as an ASSET, so nothing writes its `.map` or
      // appends its `sourceMappingURL` unless we do (BUG-05 §4.3).
      const emitWithMap = (artifact: NestedArtifact): void => {
        const plan = emitPlan(artifact, nested.sourcemap);
        this.emitFile({ type: 'asset', fileName: artifact.fileName, source: plan.code });
        emitted.add(artifact.fileName);
        if (plan.map !== undefined) {
          this.emitFile({ type: 'asset', fileName: plan.map.fileName, source: plan.map.source });
          emitted.add(plan.map.fileName);
        }
      };
      // The link chunks are NOT emitted yet: their names still carry a content hash, and
      // step 3b replaces it with the build id (§5.2) — which is not known until step 3.

      // 1b. The edge pass: the wrappers that run `load` in process. They are NOT
      //     emitted into the bundle — `emitFile` means "this gets published", and this is
      //     precisely what must not (BUG-09 §4.1). They are written beside `outDir` for the
      //     preview, and materialized into the prerender's temp dir below.
      // Written to disk in 3b, not here: an edge chunk imports the shared chunks by name and
      // those are renamed there (BUG-31 §T5), so what lands beside `outDir` — and what the
      // prerender runs — has to be the rewritten code.
      // What the edge pass builds besides the routes (SDD-56): `_error.fud`, and `functions.mjs`
      // when the `.fudapi` of the app declare a single function, behind the root's handler
      // (SDD-60 §4.4).
      const locale = localeContext();
      const edgeExtras = (): EdgeExtras => {
        const contracts = hasApi();
        // The questions of the `runs remote` rules ride with the functions (SDD-80 §4.4).
        const table = contracts ? [...api.functionTable(), ...api.ruleTable()] : [];
        return {
          ...(errorPages.length > 0 ? { errorPages } : {}),
          ...(locale !== undefined ? { locale } : {}),
          ...(table.length > 0 ? { functions: emitFunctionsModule({ api: SERVER_ROOT_ID, base, table }) } : {}),
          // The generated modules whenever there are any — a library's pipe needs no root — and
          // the root only when the app declares a `.fudapi` of its own (SDD-71 §4.5).
          ...(api.sources.length > 0 ? { api: serverApi } : {}),
          ...(contracts ? { root: SERVER_ROOT_ID } : {}),
          ...(benchBuild ? { bench: true } : {}),
        };
      };
      const [link, edge] = await Promise.all([
        linking,
        runEdgePass(
          root,
          base,
          builds,
          io,
          resolveAlias,
          nested,
          projectStyles,
          linked,
          runtimeEntriesFor,
          reporter,
          edgeExtras(),
        ),
      ]);

      // 2. The Service Worker's own bundle: one realm, one bundle (BUG-03 §4.1). Its
      //    code still carries BUILD_TOKEN — the id is computed from it, below.
      //
      //    Its shell is the DECLARED one plus the static graph of the TWO main-thread
      //    entries (SDD-17 §4.7.1, BUG-31 §T2): the code they share with the hydration
      //    chunks lives in chunks whose names the build chooses, and a name the build chose
      //    is not something `sw.json` can list. The graph is right here.
      //
      //    `sw.json` therefore names neither entry any more: it used to list
      //    `/fudic-main.js` because that was a fixed name a human could write, and a fixed
      //    name is exactly what BUG-31 §T1 took away.
      const shell =
        swConfig === null
          ? []
          : [
              ...swConfig.shell,
              ...reachableChunks(bundleItems(bundle), (item) => {
                const entry = bundle[item.fileName];
                return (
                  entry?.type === 'chunk' &&
                  (isCoordinatorChunk(entry.facadeModuleId) || entry.facadeModuleId === BOOT_ID)
                );
              }).map((fileName) => `${base}${fileName}`),
              // And everything a document's own `<head>` links (BUG-40 §4.5). Same argument
              // as the two entries above: their names are the build's, so `sw.json` cannot
              // list them. Left out of the install they are met by a runtime rule instead,
              // and a cache-first rule caches on the first request that reaches the WORKER —
              // which is the second load, so the page only worked offline on the third.
              ...linked.shell(),
            ];
      const sw =
        swConfig === null
          ? null
          : await buildServiceWorker(
              root,
              base,
              {
                manifestUrlExpr: JSON.stringify(manifestUrl),
                shell: [...new Set(shell)],
                resources: swConfig.resources,
                // Where the published runtime lives, and the cache it fills AS IT IS USED
                // (SDD-45 §4.5.1). Empty for a project that links none, and then the worker
                // is the one it was before this SDD.
                runtimePrefix: runtime.packages.length === 0 ? '' : `/${RUNTIME_DIR}/`,
                runtimeCache: runtimeCacheOf(runtime),
                // The sweep of §4.9: the family of runtime caches to walk, and this
                // application's mark inside the one it uses.
                runtimeCachePrefix: RUNTIME_CACHE_PREFIX,
                runtimeMarker: runtimeMarkerUrl(appId),
                // The renderer, linked instead of bundled (§4.10). Empty — and then bundled,
                // as before — for a project where `@fudic/ssr` publishes nothing this build
                // can see, which `FUD0804` has already said.
                renderer: pieceUrl(runtime, '@fudic/ssr', 'index') ?? '',
                // Non-empty by construction: a `sw.json` without an `id` is FUD0721 and
                // this build already failed in `buildStart` (SDD-41 §4.3).
                app: appId,
              },
              resolveAlias,
              nested,
            );

      // 2-bis. No `sw.json`, no `boot` — neither the tag nor the FILE (§4.11). The entry is
      //     declared in `config()`, long before this project's `sw.json` has been read, so
      //     what is decidable here is dropping the chunk: nothing references it any more,
      //     because the head stopped writing its tag.
      if (swConfig === null) {
        for (const [name, item] of Object.entries(bundle)) {
          if (item.type === 'chunk' && item.facadeModuleId === BOOT_ID) delete bundle[name];
        }
      }

      // 3. The build id: it names every cache and lives inside the SW, so a new build
      //    changes the SW's own bytes → the browser updates → activate purges (§4.10).
      //
      //    It hashes the worker's CODE, not its file name. `fudic-sw.js` has a fixed,
      //    unhashed name, and now that the runtime is bundled inside it instead of shared
      //    under `/assets/`, a change to `@fudic/transport` moves no file name at all. An
      //    id derived from names would then never move — and a browser that never sees a
      //    new SW never purges the old caches (BUG-03 §4.3).
      const buildId = createHash('sha256')
        .update([...Object.keys(bundle), ...link.chunks.map((c) => c.fileName)].sort().join('|'))
        .update(sw === null ? '' : `|${sw.fileName}|${sw.code}`)
        .digest('hex')
        .slice(0, BUILD_ID_LENGTH);
      // Substituted in the SW's code before it is emitted. A surviving token produces caches
      // called `shell-<token>` that `isStaleCache` never purges — silently, forever. That is
      // what §6.4 exists to catch.
      //
      // The id measures exactly what the token measures, so this rewrite preserves every
      // offset and the map generated for `sw.code` still describes what is emitted
      // (BUG-05 §4.4).
      //
      // The EMIT itself waits for 3b: the SW's `SHELL` names the shared chunks literally, and
      // those are about to be renamed (BUG-31 §T5). Emitting here would precache the names
      // the build no longer writes — an install that 404s on every entry, silently.
      const swCode = sw === null ? null : sw.code.split(BUILD_TOKEN).join(buildId);

      // 3a. And the SAME substitution in `fudic-main` (SDD-17 §4.6). The main thread has to
      //     build the URL resolver, which takes `base` and the build id: `base` is baked in
      //     at `load` time, the id only exists here. There is no circularity — the id was
      //     computed from the bundle's NAMES, never from this chunk's code — and the token
      //     measures exactly what the id measures, so no offset moves and the map stays
      //     valid, exactly as in the worker above.
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk' && isCoordinatorChunk(item.facadeModuleId)) {
          item.code = item.code.split(BUILD_TOKEN).join(buildId);
        }
      }

      // 3b. Build-id naming (SDD-27 §5.2). The chunks whose URL the client DERIVES —
      //     the link pass and the hydration chunks — trade their content hash for the
      //     build id, so the manifest can state names instead of URLs. Same length, so no
      //     offset moves and every source map stays valid; and no circularity, because the
      //     id above was computed from the ORIGINAL names.
      // Identified by their FACADE MODULE, not by their output path: `assetsDir` and the
      // output naming are the host's to configure, and the one thing that cannot move is
      // which module a chunk is the facade of.
      const clientChunks = Object.values(bundle).filter(
        (item): item is typeof item & { code: string; fileName: string } =>
          item.type === 'chunk' &&
          typeof item.facadeModuleId === 'string' &&
          (hasQuery(item.facadeModuleId, CLIENT_QUERY) || hasQuery(item.facadeModuleId, IOC_QUERY)),
      );
      //     The SHARED chunks travel with them (BUG-31 §T5). They used to keep their content
      //     hash on the argument that the browser's HTTP cache could then skip them across
      //     deploys — but nothing in this architecture collects on that: `activate` deletes
      //     every cache that is not this build's, and the hydration chunks that import them
      //     change name on every build anyway. What the hash did cost was a manifest that had
      //     to write out 8 characters of noise per dependency, because a hashed name is a
      //     fact of the build and cannot be derived. Same length, so the offsets hold.
      const isEntry = (facade: string | null | undefined): boolean =>
        isCoordinatorChunk(facade) || facade === BOOT_ID;
      const hashedShared = reachableChunks(bundleItems(bundle), (item) => {
        const entry = bundle[item.fileName];
        return (
          entry?.type === 'chunk' &&
          (isEntry(entry.facadeModuleId) || clientChunks.some((c) => c.fileName === item.fileName))
        );
      }).filter(
        (fileName) =>
          isHashedChunk(fileName) && !clientChunks.some((c) => c.fileName === fileName),
      );
      // The two main-thread entries go through the SAME plan as everything else (BUG-31 §T1).
      // They can, now that `config()` names them `fudic-main-__FUDB__.js`: that is already a
      // name of the expected shape, so `planRename` derives theirs like any other and the
      // substitution is token→id, 8 characters for 8.
      //
      // They used to be a hand-written exception to the plan, named `fudic-main.js` and
      // renamed to `fudic-main-<id>.js` — nine characters longer. `planRename` promises
      // length invariance and `rewriteReferences` relies on it blindly; that exception broke
      // the promise for every chunk that mentions the name, the Service Worker's `SHELL`
      // included, and it did so AFTER the maps were generated. The fix is not to special-case
      // the rewrite: it is to stop having an exception.
      const entryChunks = Object.values(bundle).filter(
        (item): item is typeof item & { code: string; fileName: string } =>
          item.type === 'chunk' && isEntry(item.facadeModuleId),
      );
      // ONE set for the whole plan. The four sources overlap by construction now: an entry
      // is named `fudic-main-__FUDB__.js`, which `isHashedChunk` reads as hashed — correctly,
      // that is the point of the token — so `hashedShared` reaches the entries too. A name
      // listed twice is a name colliding with itself, and `planRename` refuses the WHOLE plan
      // on a collision (FUD0501), which would leave `__FUDB__` in the file names on disk.
      const rename = planRename(
        [
          ...new Set([
            ...link.chunks.map((c) => c.fileName),
            ...clientChunks.map((c) => c.fileName),
            ...entryChunks.map((c) => c.fileName),
            ...hashedShared,
          ]),
        ],
        buildId,
      );
      reporter.report(this, rename.diagnostics);
      const renames = rename.files;
      // Every chunk of the bundle, not only the renamed ones: a shared chunk that moved is
      // imported by `fudic-main` and by half the hydration chunks, and a reference left
      // pointing at the old name is a 404 with no error anywhere.
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk') item.code = rewriteReferences(item.code, renames);
      }
      // One loop over the bundle covers both kinds: a hydration chunk and a shared chunk are
      // renamed the same way, and the plan is what says which of them moved.
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') {
          continue;
        }
        const to = renames.get(chunk.fileName);
        if (to === undefined) {
          continue;
        }
        // `fileName` is mutated IN PLACE and the bundle key is left alone. Deleting the
        // old key and re-adding under the new one drops the chunk from the output
        // altogether — Rollup's output list is built from the entries it had, not from a
        // re-read of the object — and the file silently stops being written. What decides
        // the written path is `fileName`, so moving that is enough.
        //
        // Its `.map` is a separate entry and follows; the `sourceMappingURL` inside the
        // code was already rewritten above, because it names the map by base name.
        const mapAsset = bundle[mapNameOf(chunk.fileName)];
        if (mapAsset !== undefined) {
          mapAsset.fileName = mapNameOf(to);
          emitted.add(mapNameOf(to));
        }
        chunk.fileName = to;
        emitted.add(to);
      }
      // 3b-bis. What each hydration chunk LOADS (SDD-17 §4.7, BUG-53 §4.1): the chunks it
      //     imports, statically or with `import()`, transitively, and the published runtime
      //     under all of them — plus what the hydration runtime itself loads on demand the
      //     first time it hydrates anything. Everything the first hydration of the tag will
      //     ask for, so the warm can lay it all down at once instead of leaving each level of
      //     the cascade to be discovered inside the gesture.
      //
      //     Computed right after the rename, so the names are the ones published, and before
      //     the passes that render a head are emitted: a page with no worker preloads the
      //     graph of what it hydrates at load (3b-ter). The prune below never drops a file of
      //     this graph, because it keeps everything a hydration chunk reaches.
      //     The walk goes by bundle KEY, which is what `imports` speaks in; only the answer
      //     is translated to file names, because the rename moved `fileName` alone.
      //     The tag comes from the facade module, normalized: `emitFile` was given the path
      //     as the filesystem spells it and Vite hands it back with forward slashes.
      const slashes = (path: string): string => path.replace(/\\/gu, '/');
      const tagOfFacade = new Map([
        ...discoverComponents(builds, io).map(
          (comp) => [slashes(clientId(comp.path)), comp.tag] as const,
        ),
        // A route's chunk has imports to warm exactly as a component's does, and it is filed
        // under its NAME because that is what the runtime asks by (SDD-39 §4.7).
        ...discoverReactiveRoutes(builds, io).map(
          (route) => [slashes(clientId(route.path)), route.name] as const,
        ),
      ]);
      const items = bundleItems(bundle);
      const hydrateDeps: Record<string, readonly string[]> = {};
      // The pieces never reach the bundle graph: they are URLs inside the code.
      const hydratePieces: Record<string, readonly string[]> = {};
      const codeOf = new Map(
        Object.entries(bundle).flatMap(([key, item]) => (item.type === 'chunk' ? [[key, item.code] as const] : [])),
      );
      const deferred = deferredPieces(runtime);
      const resolver = createUrlResolver(base, buildId);
      const filesOf = new Map<string, readonly string[]>();
      for (const [key, item] of Object.entries(bundle)) {
        // A locale's chunk is `x.fud?client&locale=en`, and the runtime asks for it as
        // `en/<tag>` (SDD-58 §4.6): filed under that name, or the worker warms another file.
        const facade = item.type === 'chunk' ? slashes(item.facadeModuleId ?? '') : '';
        const found = tagOfFacade.get(idWithoutLocale(facade));
        if (found === undefined) {
          continue;
        }
        const tag = `${chunkDir(localeOf(facade), locales)}${found}`;
        const graph = reachableChunks(items, (i) => i.fileName === key, true);
        const deps = graph
          .filter((fileName) => fileName !== key)
          .map((fileName) => bundle[fileName]?.fileName ?? fileName);
        if (deps.length > 0) {
          hydrateDeps[tag] = deps;
        }
        // Every name in `graph` is a chunk: that is what `reachableChunks` walks.
        const code = graph.map((fileName) => codeOf.get(fileName)).join('\n');
        // Sorted once, for the manifest and for the graph a coordinator carries alike: the two
        // name the same files, and a page should not see them in another order (BUG-54).
        const pieces = [...new Set([...linkedPieces([code], runtime).map((p) => p.url), ...deferred])].toSorted(
          (a, b) => a.localeCompare(b),
        );
        if (pieces.length > 0) {
          hydratePieces[tag] = pieces;
        }
        // The whole graph as URLs, for the head of a page that hydrates this tag at load.
        filesOf.set(tag, [
          resolver.hydrateUrl(tag),
          ...deps.map((fileName) => resolver.assetUrl(fileName)),
          ...pieces,
        ]);
      }

      // 3b-ter. The head of a page with no worker preloads what that page hydrates at LOAD,
      //     chunk and graph (BUG-53 §4.3): those files are asked for before anybody touches
      //     anything, and without a link each level of their imports is discovered one round
      //     trip after the last. The head was written with one token per route where the list
      //     goes (`runtimeEntriesFor`), because the graph only exists now; it is filled in
      //     every pass that renders a head. Not what the head already preloads for the
      //     coordinator, so no URL is named twice.
      const eagerFiles = new Map(
        [...eagerByPattern].map(([pattern, tags]) => {
          // A route is in `eagerByPattern` only when it has a coordinator.
          const head = new Set(loadedPieces(coordinators.get(pattern)!.source, runtime));
          // And every eager tag hydrates, so it has a chunk and a graph (`fud-eager` §4.5).
          const files = tags.flatMap((tag) => filesOf.get(tag)!);
          return [eagerToken(pattern), [...new Set(files)].filter((url) => !head.has(url))] as const;
        }),
      );
      // Never empty: the tag's own chunk is in it, and the head never names that one.
      const fillEager = (code: string): string =>
        code.replace(EAGER_TOKEN_RE, (_match, _quote: string, token: string) =>
          eagerFiles.get(token)!.map((url) => JSON.stringify(url)).join(','),
        );

      // 3b-quater. The graph a coordinator of a page with no worker carries (BUG-53 §4.3): for
      //     the tags its route can warm, what each one loads besides its own chunk. Written
      //     here because the graph only exists now; the page never downloads the manifest,
      //     which holds the graph of every tag of the application. The literal is JSON text.
      //     Every tag a route warms has a chunk: its components and its own client half are
      //     emitted for every route that is not excluded, and only those get a coordinator.
      const graphLiteral = (tags: string): string =>
        JSON.stringify(
          JSON.stringify(
            Object.fromEntries(
              tags
                .split(',')
                .filter((tag) => tag !== '')
                .map((tag) => [tag, filesOf.get(tag)!.slice(1)]),
            ),
          ),
        );
      // Inside a coordinator, and inside a head that inlines one, where the source is itself a
      // string literal and the placeholder's quotes arrive escaped.
      const fillGraph = (code: string): string =>
        code
          .replace(/\\(["'])__fudic_graph__:([^"'`\\]*)\\\1/gu, (_m, _q: string, tags: string) =>
            JSON.stringify(graphLiteral(tags)).slice(1, -1),
          )
          .replace(GRAPH_TOKEN_RE, (_m, _q: string, tags: string) => graphLiteral(tags));
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk' && isCoordinatorChunk(item.facadeModuleId)) item.code = fillGraph(item.code);
      }

      for (const chunk of link.chunks) {
        emitWithMap({
          ...chunk,
          fileName: renames.get(chunk.fileName) ?? chunk.fileName,
          // The token too: a link chunk writes the runtime entry URLs into the head it
          // renders (BUG-31 §T1), and those carry the id.
          code: fillGraph(rewriteReferences(chunk.code.split(BUILD_TOKEN).join(buildId), renames)),
        });
      }
      // The Service Worker, now that the names it precaches are the ones on disk. Its own
      // file name is fixed and unhashed, so only the code moves.
      if (sw !== null && swCode !== null) {
        emitWithMap({ ...sw, code: rewriteReferences(swCode, renames) });
      }
      // And the edge chunks, which the preview serves and the prerender runs from a temp dir
      // below: they import the same shared chunks by name. They are what renders the head of
      // a page with no worker, so the eager preloads are filled here (3b-ter). That one line
      // changes length, and only the columns after it on that line move in its map.
      //
      // A name the edge pass wrote too is renamed only where it is written whole: a module both
      // passes bundle alone — a preset of `@fudic/core`, which imports nothing — comes out with
      // the same bytes and the same hash in each, and renaming it by its base name would point
      // the edge's own `./number-<hash>.js` at a file that keeps its hash (SDD-71). The edge
      // names a client chunk by its path; its own chunks, relative.
      const baseName = (file: string): string => file.slice(file.lastIndexOf('/') + 1);
      const edgeOwn = new Set(edge.chunks.map((c) => baseName(c.fileName)));
      const edgeRenames = new Map([...renames].filter(([from]) => !edgeOwn.has(baseName(from))));
      const shared = [...renames].filter(([from]) => edgeOwn.has(baseName(from)));
      const edgeChunks = edge.chunks.map((c) => {
        let code = rewriteReferences(c.code.split(BUILD_TOKEN).join(buildId), edgeRenames);
        for (const [from, to] of shared) code = code.split(from).join(to);
        return { ...c, code: fillGraph(fillEager(code)) };
      });
      if (writeToDisk) {
        rmSync(edgeDir, { recursive: true, force: true });
        for (const chunk of edgeChunks) {
          const abs = join(edgeDir, chunk.fileName);
          mkdirSync(dirname(abs), { recursive: true });
          writeFileSync(abs, chunk.code);
          // With its map, which the process reads (SDD-60 §4.6): a handler that throws in
          // preview or behind an adapter names the `.ts` it was written in.
          if (chunk.map !== undefined) writeFileSync(`${abs}.map`, chunk.map);
        }
      }

      // 3c. Prune the `page` pass (SDD-27 §5.1). Its chunks have no consumer, but the pass
      //     is what made Vite emit the linked ASSET files, so only the chunks go — and
      //     only now, once every asset has been emitted and named.
      //
      //     Reachability, not names: the roots are what something actually loads, and
      //     everything they import comes along. That is what keeps the shared `element-*`
      //     without this file ever having heard of it.
      //
      //     Keyed by the ORIGINAL bundle keys: the rename above moved `fileName`, never the
      //     key, and `imports` still speaks in keys.
      const keep = keepSet(
        bundleItems(bundle),
        (item) => {
          const entry = bundle[item.fileName];
          const facade = entry?.type === 'chunk' ? entry.facadeModuleId : null;
          return (
            isCoordinatorChunk(facade) ||
            facade === BOOT_ID ||
            (facade != null && (hasQuery(facade, CLIENT_QUERY) || hasQuery(facade, IOC_QUERY)))
          );
        },
      );
      for (const fileName of Object.keys(bundle)) {
        if (!keep.has(fileName)) {
          delete bundle[fileName];
          emitted.delete(fileName);
        }
      }

      // 3c-bis. Copy the pieces this build LINKS, and only those (SDD-45 §4.2).
      //
      //     Read back out of the code that survived, not out of the module graph: what has to
      //     be copied is what a browser will ask for, and the only honest record of that is
      //     the import that came through minification, tree-shaking and the prune above. It is
      //     also what makes the pruning measurable — an application that never derives a
      //     signal emits no import of `computed`, so no `computed.js` lands in its `dist`.
      //
      //     A `dist` stays a complete, separately deployable tree: it carries the pieces it
      //     names, at the same origin-absolute path the imports use, so two applications
      //     deploy over one origin in any order and overwrite each other with identical bytes.
      const copy = piecesToCopy(
        linkedPieces(
          [
            ...Object.values(bundle).flatMap((item) => (item.type === 'chunk' ? [item.code] : [])),
            // The worker's code too, and it is not a chunk of this bundle: it has its own
            // build and arrives as an asset. Since §4.10 it names the renderer's URL, and a
            // piece nobody copies is a 404 on the first navigation the worker tries to
            // render — offline, where there is no server to fall through to.
            ...(swCode === null ? [] : [swCode]),
          ],
          runtime,
        ),
        (fileName) => {
          // What is ALREADY on the origin, which is a question about the disk and not about
          // this bundle. A build that writes nothing has no origin to disagree with.
          if (!writeToDisk) return undefined;
          const abs = join(outDir, fileName);
          return existsSync(abs) ? readFileSync(abs, 'utf8') : undefined;
        },
      );
      reporter.report(this, copy.diagnostics);
      for (const file of copy.files) {
        this.emitFile({ type: 'asset', fileName: file.fileName, source: file.code });
        emitted.add(file.fileName);
      }

      // 4. The manifest: the one contract, emitted at a fixed URL.
      const unlinked: FudDiagnostic[] = [];
      // The early hints of each route (SDD-70 §3.10): the sheets its head links, then the entries
      // it loads and their static imports in depth, under the build's own id. Off with
      // `earlyHints: false`.
      //
      // What `main` loads is walked in the bundle, statically: the chunks it imports (a runtime
      // bundled into the app) and the published pieces under all of them (a linked runtime).
      const hintItems = bundleItems(bundle);
      const hintsOf = (rb: RouteBuild): readonly string[] => {
        const boot = runtimeEntriesFor(rb.route.pattern).boot.split(BUILD_TOKEN).join(buildId);
        const coordinator = coordinators.get(rb.route.pattern) ?? null;
        const id = coordinator === null ? undefined : coordinatorIds.get(coordinator.source);
        const key = Object.keys(bundle).find((k) => {
          const item = bundle[k]!;
          return item.type === 'chunk' && id !== undefined && item.facadeModuleId === id;
        });
        const graph = key === undefined ? [] : reachableChunks(hintItems, (i) => i.fileName === key);
        const modules = [
          boot,
          ...graph.map((k) => `${base}${bundle[k]!.fileName}`),
          ...loadedPieces(graph.map((k) => codeOf.get(k)).join('\n'), runtime),
        ];
        return routeHints(pageHints.get(pageHintKey(rb.absPath, rb.locale)) ?? [], modules);
      };
      // `_error.fud` is no input of this bundle, so no `transform` here saw its head: it is the
      // edge pass's, and the build's memory hands back what that pass compiled (SDD-73 §3.3).
      // One `errorHints` for the app: with languages, the first locale's, whose sheets and
      // entries every other locale's error page shares.
      const errorPage = errorPages[0];
      if (errorPage !== undefined) {
        const compiled = await compileFud(
          errorPage.absPath,
          ioFor(errorPage.locale),
          undefined,
          projectStyles,
          linked,
          compileFor(errorPage.locale),
        );
        // A `.fud`, so compiled; and a build prunes every page, so its hints are there.
        pageHints.set(pageHintKey(errorPage.absPath, errorPage.locale), compiled!.result.hints!);
      }
      const { file, diagnostics } = buildManifest(builds, {
        ...(errorPage === undefined ? {} : { errorPage }),
        build: buildId,
        base,
        headers: manifestHeadersOf(appHeaders.config),
        serviceWorker: swConfig !== null,
        hydrateDeps,
        hydratePieces,
        ...(project.config?.earlyHints === false ? {} : { hintsOf }),
        depsOf: (rb) => {
          if (!link.entries.has(rb.route.pattern)) {
            unlinked.push(FUD0399({ pattern: rb.route.pattern }));
            return null;
          }
          return chunkNamesOf(link.deps.get(rb.route.pattern) ?? []);
        },
      });
      reporter.report(this, [...unlinked, ...diagnostics]);
      this.emitFile({ type: 'asset', fileName: manifestFileName, source: JSON.stringify(file) });
      emitted.add(manifestFileName);

      // 4-bis. The app for `createServer` (SDD-81 §3.10), beside the edge chunks it imports:
      //     what preview mounts, and what an adapter mounts the same way. Never in `outDir`.
      if (writeToDisk) {
        const edgeFiles = new Set(edge.chunks.map((c) => c.fileName));
        const chunkOf = (pattern: string): string | undefined => {
          const name = `${safeName(pattern)}.js`;
          return edgeFiles.has(name) ? name : undefined;
        };
        const server = emitServerModule({
          base,
          locales: locales.length < 2 ? [] : locales,
          headers: file.headers,
          // The two files that govern updates (SDD-20 §4.11): never cached, and the worker
          // allowed the app's whole scope with `sw.headers`.
          files: { manifest: `/${manifestFileName}`, ...(swConfig === null ? {} : { worker: `/${DEV_SW_URL}` }) },
          routes: file.routes.map((record) => {
            const chunk = edge.entries.get(record.pattern);
            return { pattern: record.pattern, hints: record.hints ?? [], ...(chunk !== undefined ? { file: chunk } : {}) };
          }),
          errorPages: errorPages.flatMap((page) => {
            const chunk = chunkOf(page.route.pattern);
            return chunk === undefined ? [] : [{ locale: locales.length < 2 ? '' : (page.locale ?? locales[0]!), file: chunk }];
          }),
          errorHints: file.errorHints ?? [],
          ...(edgeFiles.has(FUNCTIONS_FILE) ? { functions: FUNCTIONS_FILE } : {}),
          config: project.config?.serve ?? {},
          ...(benchBuild ? { bench: true } : {}),
        });
        mkdirSync(edgeDir, { recursive: true });
        writeFileSync(join(edgeDir, SERVER_FILE), server);
      }

      // 5. Prerender: run each prerenderable route's BUILT chunk and write its `.html`.
      const prerenders = builds.filter((b) => b.decision.prerender);
      // The token only when `page.headers` asks for a nonce (SDD-84 §4.7): none otherwise.
      const nonced = wantsNonce(file.headers);
      // Every route that broke, and not only the first: one build tells all of them (SDD-35).
      const prerenderDiagnostics: FudDiagnostic[] = [];
      if (prerenders.length > 0 || edge.root !== undefined) {
        const dir = mkdtempSync(join(tmpdir(), 'fudic-prerender-'));
        try {
          materializeBundle(bundle as unknown as Record<string, BundleItem>, dir);
          // The wrapper it runs is the EDGE one, which is no longer in the bundle: it is
          // materialized here from the edge pass, and dies with the temp dir.
          materializeBundle(Object.fromEntries(
            edgeChunks.map((c) => [
              c.fileName,
              // Its map goes with it: the code carries a `sourceMappingURL`, and a chunk
              // whose map is missing makes Node warn on every prerendered route.
              c.map === undefined
                ? { type: 'chunk' as const, code: c.code }
                : { type: 'chunk' as const, code: c.code, map: c.map },
            ]),
          ), dir);
          // The implementations, loaded once as the server will load them (SDD-60 §4.6): two of
          // one piece, or one in the wrong folder, stop the build with the registry's own words.
          if (edge.root !== undefined) {
            const loaded = (await import(pathToFileURL(join(dir, edge.root)).href)) as { readonly ready: Promise<void> };
            await loaded.ready.catch((err: unknown) => {
              this.error({ message: err instanceof Error ? err.message : String(err) });
            });
          }
          for (const rb of prerenders) {
            const fileName = edge.entries.get(rb.route.pattern);
            if (fileName === undefined) {
              continue;
            }
            const chunkPath = join(dir, fileName);
            try {
              if (rb.decision.enumerate) {
                const { files, incomplete } = await prerenderEnumerated(chunkPath, rb.route.pattern, { nonce: nonced });
                for (const f of files) {
                  this.emitFile({ type: 'asset', fileName: f.path, source: f.html });
                  emitted.add(f.path);
                }
                for (const bad of incomplete) {
                  prerenderDiagnostics.push(FUD0362({ entry: bad, pattern: rb.route.pattern }));
                }
              } else if (!rb.route.pattern.includes(':')) {
                const html = await renderChunkToHtml(chunkPath, rb.route.pattern, { nonce: nonced });
                this.emitFile({ type: 'asset', fileName: htmlPathFor(rb.route.pattern), source: html });
                emitted.add(htmlPathFor(rb.route.pattern));
              }
            } catch (err) {
              // A page for nobody, served to everyone (SDD-69 §4.4): on the route's `load`. A
              // render reads the session only in a `load` or a `layout`, which its `.fudapi` declares.
              if (err instanceof SessionRead) {
                prerenderDiagnostics.push(FUD1300({ pattern: rb.route.pattern, ...rb.analysis.apiAt! }));
                continue;
              }
              // A broken page BREAKS THE BUILD (SDD-39 §4.11). It used to warn and skip the
              // file, which shipped a site with one page missing and CI in green — a route
              // that throws while rendering is not a degradation, it is a page that does not
              // exist. No span: this is the build's diagnostic and not the file's.
              prerenderDiagnostics.push(FUD0620({ pattern: rb.route.pattern, reason: (err as Error).message }));
            }
          }
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      }
      reporter.report(this, prerenderDiagnostics);
      // Every page of a static build with two or more locales, also without its prefix
      // (SDD-58 §4.5): `/` and `/blog/hola` are the `x-default` of their pages, and a host
      // that cannot negotiate serves this one, which sends the browser to the first locale.
      if (locales.length >= 2) {
        for (const page of unprefixedPages(emitted, locales)) {
          this.emitFile({ type: 'asset', fileName: page.fileName, source: redirectHtml(page, base, site) });
          emitted.add(page.fileName);
        }
      }

      // 5a. A public file somebody reached by a relative path (FUD0366). Reported here
      //     rather than at the transform because the passes repeat: the same `.fud` is
      //     compiled by the host, the link pass and the edge pass, and one mistake would
      //     be said three times.
      reporter.report(this, linked.publicByPath().map((url) => FUD0366({ url })));

      // 5a'. The sheets, once each and not once per page (SDD-49 §4.11): what a sheet or a
      //      file it imports says about itself (an `@import` it cannot flatten or that breaks,
      //      text it cannot read), and a sheet or imported file no page of the application
      //      keeps a single rule of. Here, after every pass has compiled every route, because
      //      only then is «no page» a fact. The errors last, so every warning is out first.
      const sheets: FudDiagnostic[] = [];
      for (const [sheet, diagnostics] of linked.sheetDiagnostics()) {
        // A diagnostic of a sheet without a file of its own is about the sheet.
        for (const d of diagnostics) {
          sheets.push(d.file === undefined && d.span !== undefined ? { ...d, file: sheet } : d);
        }
      }
      // At the line that brings the sheet in, which is the one to remove; a `fudic.json`
      // entry has no line of its own here, and points at the file.
      // A sheet a style guide imports reaches the pages through the guide (SDD-79): unused by
      // the components of one build is no dead CSS.
      for (const { name, site } of linked.unusedSheets()) {
        if (site === undefined && guidedSheets.has(name)) continue;
        sheets.push(
          site === undefined
            ? FUD0852({ file: join(root, CONFIG_FILE), sheet: name })
            : FUD0852({ file: site.file, span: site.span, sheet: relative(root, name).replace(/\\/gu, '/') }),
        );
      }
      // The reporter says the warnings first and the errors last, in one failure.
      reporter.report(this, sheets);

      // 5b. The files the project's `.fud` link, published under the name every pass was
      //     told (BUG-40). It happens HERE, after the link and edge passes have run, because
      //     a file only one of them reached is still a file the documents reference.
      for (const [fileName, source] of linked.files()) {
        if (emitted.has(fileName)) {
          continue;
        }
        this.emitFile({ type: 'asset', fileName, source });
        emitted.add(fileName);
      }

      // 6. The declared shell, checked against what the build actually produced. The
      //    install's `catch` stays as the last safety net, not as the detector.
      reporter.report(
        this,
        missingShellEntries(swConfig?.shell ?? [], base, emitted, publicDir).map((entry) => FUD0391({ entry })),
      );

      // 7. The headers against what was really emitted (SDD-84 §4.2): what the pages and the
      //    worker need from their policies, and the cache rules against the files and `sw.json`.
      //    What was gathered is left for the editor, which compiles nothing.
      const needs = emittedNeeds();
      if (writeToDisk) writeCspNeeds(root, needs);
      const caching =
        swConfig === null
          ? null
          : {
              // What `sw.json` declares: fudic's own chunks in the shell are its business.
              shell: swConfig.shell.map((entry) => (entry.startsWith(base) ? `/${entry.slice(base.length)}` : entry)),
              cacheFirst: swConfig.resources.filter((rule) => rule.policy === 'cache-first').map((rule) => rule.pattern),
            };
      reporter.report(this, [
        ...checkEmitted(appHeaders, needs),
        ...checkAssets(appHeaders.config.assets, builtFilesOf(emitted, publicFilesOf(publicDir)), caching),
      ]);
    },
  };
}

/**
 * The `shell` entries the build did not produce (BUG-01 §4.4). FUD0391 was declared and
 * never emitted: a shell entry that does not exist used to be swallowed by the install's
 * `catch`, at runtime and on the client — the one place nobody can fix it.
 *
 * Two things are legitimately absent from the bundle and must NOT be reported: files
 * under `publicDir` (copied verbatim) and cross-origin URLs (not ours to check).
 */
export function missingShellEntries(
  shell: readonly string[],
  base: string,
  emitted: ReadonlySet<string>,
  publicDir: string,
): string[] {
  const missing: string[] = [];
  for (const entry of shell) {
    if (!entry.startsWith('/')) {
      continue; // an absolute URL to another origin: outside this build
    }
    const path = (entry.split('?')[0] ?? entry).slice(entry.startsWith(base) ? base.length : 1);
    if (emitted.has(path)) {
      continue;
    }
    if (publicDir !== '' && existsSync(join(publicDir, path))) {
      continue;
    }
    missing.push(entry);
  }
  return missing;
}

/**
 * An error of the app's own code, in Vite's overlay — while the page still answers with its
 * status (SDD-56 §4.8): the overlay is for the developer, the error page for the visitor.
 */
function toOverlay(server: ViteDevServer, error: unknown): void {
  if (error instanceof Error) server.ssrFixStacktrace(error);
  server.ws.send({
    type: 'error',
    err: {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? (error.stack ?? '') : '',
    },
  });
}

/** How many sheets the project at `root` declares that only its components can use. */
function ownSheets(chains: ProjectStyleChains, root: string): number {
  const own = chains.own(root);
  const guided = chains.guidedSheets(root);
  return own.global.filter((s) => !guided.has(s.specifier)).length + own.optional.length;
}
