/**
 * The fudic Vite plugin (SDD-19 §3.1, rewired by SDD-20). The LINKER over the fs-free
 * compiler emit: it discovers page `.fud` under `routesDir`, transforms every `.fud` to
 * a module (Vite owns the graph), emits one wrapper per route in TWO formats — ESM for
 * the edge and prerender, `exports`/`require` for the Service Worker's own linker — the
 * manifest both sides read, and the two bootstraps.
 *
 * Vite is bundler and dev server only; the parser is always `@fudic/compiler`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { type Plugin, transformWithOxc } from 'vite';
import {
  applyNonce,
  cspFor,
  newNonce,
  type ManifestFile,
  type RouteRecord,
} from '@fudic/transport';
import { type FudicOptions, type ResolvedOptions, resolveOptions } from './options.js';
import { discoverRoutes, type RouteBuild } from './discover.js';
import { buildManifest } from './manifest.js';
import { emitRenderChunk } from './wrapper.js';
import { emitServerModule } from './server.js';
import { emitBootBootstrap, emitMainBootstrap, emitSwBootstrap } from './bootstrap.js';
import {
  transformFud,
  transformFudClient,
  transformFudIoc,
  NO_STYLES,
  type ProjectStyles,
} from './transform.js';
import { eraseServerValidators } from './server-validators.js';
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
  routeNameLookup,
  routeUsesDi,
} from './client.js';
import { IOC_SUFFIX } from '@fudic/compiler';
import { nodeIo, nodeLinkCheckIo } from './io.js';
import { checkLinks } from './link-check.js';
import { checkPeers } from './peer-check.js';
import { readSwConfig, type ResolvedSwConfig } from './swconfig.js';
import { nodeConfigIo, readProject, type ProjectResult } from './config.js';
import { ProjectStyleChains } from './styles.js';
import { nodePackageFs } from '@fudic/resolve';
import { LinkedAssets } from './linked-assets.js';
import { CONFIG_FILE, type ConfigDiagnostic } from '@fudic/config';
import { runLinkPass, safeName, type LinkResult } from './link.js';
import { runEdgePass } from './edge.js';
import { buildServiceWorker } from './swbuild.js';
import { emitPlan, type NestedArtifact, type NestedOutputOptions } from './nested.js';
import {
  htmlPathFor,
  materializeBundle,
  renderChunkToHtml,
  prerenderEnumerated,
  type BundleItem,
} from './prerender.js';
import {
  FUD_PATHS_INCOMPLETE,
  FUD_ASSET_NOT_FOUND,
  FUD_CHUNK_NOT_EMITTED,
  FUD_PRERENDER_FAILED,
  FUD_ROUTE_NAME_COLLISION,
  FUD_PUBLIC_BY_PATH,
  FUD_STYLES_NOT_ADOPTED,
  FUD_SW_SHELL_MISSING,
} from './diagnostics.js';
import { devUrl, devManifest, devClientTag, devClientPrefix, withInlineSourceMap } from './dev.js';
import {
  matchRouteBuild,
  renderRouteHtml,
  loadRouteData,
  type RenderModule,
} from './serve.js';
import {
  WRAPPER_PREFIX,
  SW_ID,
  MAIN_ID,
  BOOT_ID,
  DATA_PREFIX,
  EDGE_DIR,
  BUILD_TOKEN,
  BUILD_ID_LENGTH,
  DEV_MAIN_URL,
  DEV_BOOT_URL,
  DEV_SW_URL,
  mainFileName,
  bootFileName,
  PAGE_NAME_PREFIX,
} from './constants.js';
import { chunkNamesOf } from './names.js';
import { runtimeUrls } from './constants.js';
import { planRename, rewriteReferences, mapNameOf, isHashedChunk } from './rename.js';
import { keepSet, reachableChunks, type PruneItem } from './prune.js';

/**
 * The bundle as reachability items, keyed by its ORIGINAL keys — which is what `imports`
 * speaks in, whatever `fileName` was later moved to (§5.2).
 */
function bundleItems(bundle: Record<string, { type: string; imports?: readonly string[] }>): PruneItem[] {
  return Object.entries(bundle).map(([fileName, item]) => ({
    type: item.type,
    fileName,
    ...(item.type === 'chunk' && item.imports !== undefined ? { imports: item.imports } : {}),
  }));
}

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
  let builds: readonly RouteBuild[] = [];
  let swConfig: ResolvedSwConfig | null = null;
  /** Who this project is (SDD-41). Empty until `configResolved` has run. */
  let project: ProjectResult = { config: null, warnings: [], errors: [] };
  /**
   * The app id that namespaces this application's caches (BUG-33). Resolved once, here,
   * so the two places that bake it into the worker read a string and not an optional:
   * where a worker is actually emitted it cannot be empty, because a `sw.json` without an
   * `id` is FUD0721 and the build already stopped (SDD-41 §4.3).
   */
  let appId = '';
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
  let styleErrors: readonly ConfigDiagnostic[] = [];
  /** `FUD0743`, read once per sheet rather than once per route it travels into (§4.5). */
  let styleWarnings: readonly ConfigDiagnostic[] = [];
  let writeToDisk = true;
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
  const io = nodeIo();
  const linkCheckIo = nodeLinkCheckIo();

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
    const isIoc = tag.endsWith(IOC_SUFFIX);
    const bare = isIoc ? tag.slice(0, -IOC_SUFFIX.length) : tag;
    const comp = discoverComponents(builds, io).find((c) => c.tag === bare);
    if (comp !== undefined) {
      return isIoc ? iocId(comp.path) : clientId(comp.path);
    }
    // A ROUTE's chunk lives at the same stable prefix under its own name (SDD-39 §4.12): dev
    // builds nothing, so the derivation is the one the bootstrap baked in and the server
    // publishes the `?client` module at that URL.
    const route = discoverReactiveRoutes(builds, io).find((r) => r.name === bare);
    return route === undefined ? undefined : clientId(route.path);
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
    readonly of: (path: string) => string | undefined;
  } | null = null;
  const routeNameOf = (path: string): string | undefined => {
    if (routeNames === null || routeNames.from !== builds) {
      routeNames = { from: builds, of: routeNameLookup(builds, io) };
    }
    return routeNames.of(path);
  };

  return {
    name: 'fudic',
    // Runs before `vite:resolve`, which is what claims this plugin's generated ids before
    // anything tries to find them on disk. That protection used to come from the `\0`
    // prefix on those ids; the prefix is gone because Vite/Rolldown drops a `\0` module
    // from the source map, and the code this plugin GENERATES is precisely the code worth
    // debugging. See the header of `constants.ts` for the measurement.
    enforce: 'pre',

    config(userConfig) {
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
      const pinned = (chunk: { name: string }): string => {
        if (chunk.name === 'fudic-main') return mainFileName(BUILD_TOKEN);
        if (chunk.name === 'fudic-boot') return bootFileName(BUILD_TOKEN);
        return 'assets/[name]-[hash].js';
      };
      return {
        appType: 'custom',
        build: {
          rollupOptions: {
            input: { 'fudic-main': MAIN_ID, 'fudic-boot': BOOT_ID },
            ...(hasOutputConfig ? {} : { output: { entryFileNames: pinned } }),
          },
        },
      };
    },

    configResolved(config) {
      root = config.root;
      base = config.base;
      outDir = resolvePath(config.root, config.build.outDir);
      // Copied verbatim into the output, so a shell entry may legitimately point there
      // without ever appearing in the bundle (BUG-01 §4.4).
      publicDir = typeof config.publicDir === 'string' ? config.publicDir : '';
      // The registry knows it too, because a root-absolute `href` in a `.fud` names a file
      // of THIS directory: that is what makes it checkable, and what puts it in the shell.
      linked = new LinkedAssets(config.base, publicDir);
      isDev = config.command === 'serve';
      // Forwarded to the Service Worker's nested build, which runs `configFile: false`.
      resolveAlias = config.resolve?.alias;
      // A nested build inherits the host's OUTPUT configuration; what it does not inherit
      // is a decision, not an oversight (BUG-05 §4.1). `build.sourcemap` was neither
      // applied nor reported: the option simply did nothing for these two outputs, and
      // `build.minify` did nothing for them either (BUG-06 §2.2) — the same hole, found
      // twice, which is why the list is now a type and not two ad-hoc fields.
      nested = { sourcemap: config.build.sourcemap, minify: config.build.minify };
      // `write: false` is a build that produces no files (tests, programmatic callers), so
      // the edge artifacts are not written either — they are still materialized for the
      // prerender, which needs them in a temp dir regardless.
      writeToDisk = config.build.write !== false;
      options = resolveOptions(userOptions, config.base).options;
      manifestUrl = options.manifestUrl;
      manifestFileName = manifestUrl.startsWith(base) ? manifestUrl.slice(base.length) : 'fudic-routes.json';
      // No `sw.json`, no Service Worker: everything is server/SSG (SDD-20 §4.7).
      const configIo = nodeConfigIo();
      swConfig = readSwConfig(root, configIo).config;
      // Who this project is (SDD-41). Read here, next to `sw.json`, and reported in
      // `buildStart`, which is the first hook with a context to report through.
      project = readProject(root, swConfig !== null, configIo);
      appId = project.config?.id ?? '';
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

    configureServer(server) {
      builds = discoverRoutes(root, options).routes;
      // Dev serves the bootstraps at stable root URLs (so the SW would register at root
      // scope), but registers nothing unless `sw.json` says `"dev": "preview"` (§4.11).
      const scripts = new Map<string, string>([
        [devUrl(base, DEV_MAIN_URL), MAIN_ID],
        [devUrl(base, DEV_BOOT_URL), BOOT_ID],
        [devUrl(base, DEV_SW_URL), SW_ID],
      ]);
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
          res.end(JSON.stringify(devManifest(builds)));
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
              res.setHeader('Service-Worker-Allowed', base); // root scope
              res.setHeader('Content-Security-Policy', devManifest(builds).csp.sw);
            }
            res.setHeader('Cache-Control', 'no-cache'); // these two govern updates
            // WITH its map. `transformRequest` hands back both halves and this middleware
            // used to write only the first, so nothing fudic emits was debuggable in dev.
            res.end(result === null ? '' : withInlineSourceMap(result.code, result.map));
          })
          .catch((err) => {
            res.statusCode = 500;
            res.end(`// fudic dev: failed to serve ${url}: ${(err as Error).message}`);
          });
      });

      // The dev server IS the edge (§4.11): data endpoints and on-demand navigation
      // rendering. Registered with `post` so it runs after Vite's own middlewares.
      return () => {
        server.middlewares.use((req, res, next) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            next();
            return;
          }
          const url = req.url ?? '/';
          const pathname = pathnameOf(url, base);
          // Route discovery is cheap and dev adds/removes files: re-read on each request
          // so a new `.fud` is routable without restarting the server.
          builds = discoverRoutes(root, options).routes;

          // The generated `@server load` endpoint (§4.5).
          if (pathname.startsWith(DATA_PREFIX)) {
            const routePath = pathname.slice(DATA_PREFIX.length) || '/';
            const rb = matchRouteBuild(builds, routePath);
            if (rb === null) {
              next();
              return;
            }
            loadRouteData(
              (id) => server.ssrLoadModule(id) as Promise<RenderModule>,
              WRAPPER_PREFIX + rb.route.pattern,
              rb.route.pattern,
              routePath,
            )
              .then((data) => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
              })
              .catch((err: Error) => {
                server.ssrFixStacktrace(err);
                next(err);
              });
            return;
          }

          if (!(req.headers.accept ?? '').includes('text/html')) {
            next();
            return;
          }
          const rb = matchRouteBuild(builds, pathname);
          if (rb === null) {
            next();
            return;
          }
          const nonce = newNonce();
          renderRouteHtml(
            (id) => server.ssrLoadModule(id) as Promise<RenderModule>,
            WRAPPER_PREFIX + rb.route.pattern,
            rb.route.pattern,
            pathname,
            nonce,
          )
            .then((html) => server.transformIndexHtml(url, html)) // injects the dev client
            .then((html) => {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              // In dev the HMR client is injected inline and evaluates at load; a strict
              // policy would kill it. The CSP is exercised in preview and production,
              // which is where the emitted output is what ships.
              res.end(html);
            })
            .catch((err: Error) => {
              server.ssrFixStacktrace(err);
              next(err); // Vite's error middleware shows it in the browser overlay
            });
        });
      };
    },

    configurePreviewServer(server) {
      // Preview is the production edge: it serves what a static host serves, adds the
      // CSP with a fresh nonce, and stamps that nonce into the prerendered HTML.
      const manifestPath = join(outDir, manifestFileName);
      const readManifest = (): ManifestFile | null => {
        try {
          return JSON.parse(readFileSync(manifestPath, 'utf8')) as ManifestFile;
        } catch {
          return null;
        }
      };
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          next();
          return;
        }
        const manifest = readManifest();
        const pathname = pathnameOf(req.url ?? '/', base);
        if (manifest === null) {
          next();
          return;
        }
        if (pathname === `/${manifestFileName}` || pathname === `/${DEV_SW_URL}`) {
          res.setHeader('Cache-Control', 'no-cache');
          if (pathname === `/${DEV_SW_URL}`) {
            res.setHeader('Service-Worker-Allowed', base);
            res.setHeader('Content-Security-Policy', manifest.csp.sw);
          }
          next();
          return;
        }

        // The generated data endpoint (§4.5): run the built ESM chunk's `data(ctx)`
        // in process. This is what the Service Worker fetches before rendering.
        if (pathname.startsWith(DATA_PREFIX)) {
          const routePath = pathname.slice(DATA_PREFIX.length) || '/';
          const dataRecord = matchRecord(manifest.routes, routePath);
          if (dataRecord === null || !existsSync(edgeChunkPath(root, dataRecord.pattern))) {
            next();
            return;
          }
          previewData(root, dataRecord, routePath)
            .then((data) => {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(data));
            })
            .catch(() => next());
          return;
        }

        const record = matchRecord(manifest.routes, pathname);
        if (record === null) {
          next();
          return;
        }
        const nonce = newNonce();
        const file = join(outDir, htmlPathFor(pathname));
        if (existsSync(file)) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Content-Security-Policy', cspFor(manifest.csp.document, nonce));
          res.end(applyNonce(readFileSync(file, 'utf8'), nonce));
          return;
        }
        // No prerendered file and no edge wrapper: this route produced nothing to serve.
        // Checked before importing so the fall-through stays synchronous.
        if (!existsSync(edgeChunkPath(root, record.pattern))) {
          next();
          return;
        }
        previewRender(root, record, pathname, nonce)
          .then((html) => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Content-Security-Policy', cspFor(manifest.csp.document, nonce));
            res.end(html);
          })
          .catch(() => next());
      });
    },

    buildStart() {
      // Who this project is, before anything is built with it. A malformed `fudic.json`
      // is a warning and the build goes on without configuration; a `sw.json` with no
      // `id` stops here, because caches named after nothing is not a degraded mode (§5).
      for (const d of project.warnings) {
        this.warn(`[${d.code}] ${d.message}`);
      }
      for (const d of project.errors) {
        this.error(`[${d.code}] ${d.message}`);
      }
      // The style guide's own (SDD-42 §5). Errors, and for the same reason: a sheet that is
      // not there renders exactly like a sheet that did nothing.
      for (const d of styleErrors) {
        this.error(`[${d.code}] ${d.message}`);
      }
      // And the same questions asked of the LIBRARIES this project consumes (SDD-43 §4.6).
      // Reading the whole chain here, before anything is emitted, is what makes this one
      // report naming the package instead of one per document that happens to compose a
      // component from it.
      if (styleChains !== null) {
        styleChains.chainOfPackage(root);
        for (const d of styleChains.diagnostics) {
          this.error(`[${d.code}] ${d.message}`);
        }
      }
      // Whether each library can be parsed by THIS compiler (SDD-43 §4.7). A warning, once
      // per library: the range is the library author's judgement from the day they published,
      // and a range one minor too narrow must not stop a build that works.
      for (const d of checkPeers(root, nodePackageFs())) {
        this.warn(`[${d.code}] ${d.message}`);
      }
      // And what the sheet says that its destination cannot hear (§4.5). A warning, and
      // the sheet is emitted whole: the same file served to the document too is a legitimate
      // shape, and there those rules are the correct ones.
      for (const d of styleWarnings) {
        this.warn(`[${d.code}] ${d.message}`);
      }

      const discovered = discoverRoutes(root, options);
      builds = discovered.routes;
      for (const d of discovered.diagnostics) {
        this.warn(`[${d.code}] ${d.message}`);
      }

      // What the links NAME, before anything walks them (SDD-43 §4.3). The graph walk reads
      // every file it reaches and stops at the first one it cannot, with an `ENOENT` naming
      // a path the author never wrote — so the questions only a resolver can answer are
      // asked here, where there is still something to say about them.
      for (const d of checkLinks(
        builds.map((rb) => rb.absPath),
        linkCheckIo,
      )) {
        this.error(`[${d.code}] ${d.message} (in ${d.file})`);
      }
      // FUD0742, and it is the BUILD's rather than the emit's because what it is about is
      // the PROJECT: a sheet that nothing adopts. The emit sees one file at a time, so the
      // same fact stated there would be one warning per route for a single mistake.
      // THIS project's own sheets, not the chain's: a library's guide is adopted by the
      // library's own components, and whether this project defines any says nothing about it.
      if (
        styleChains !== null &&
        styleChains.own(root).styles.length > 0 &&
        discoverComponents(builds, io).length === 0
      ) {
        this.warn(
          `[${FUD_STYLES_NOT_ADOPTED}] ${CONFIG_FILE} declares "styles" and this project defines no component: ` +
            'a project sheet is adopted into the shadow roots of its own components, and there are none. ' +
            'A stylesheet meant for the document goes in a <link rel="stylesheet"> in the layout.',
        );
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
      for (const comp of discoverComponents(builds, io)) {
        this.emitFile({
          type: 'chunk',
          id: clientId(comp.path),
          name: clientChunkName(comp.tag),
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
            id: iocId(comp.path),
            name: iocChunkName(comp.tag),
            preserveSignature: 'strict',
          });
        }
      }

      // And one per REACTIVE route (SDD-39 §3.5). Same directory and same arithmetic as a
      // component's, because the runtime derives both URLs through one `resolveChunk` — what
      // it is handed is a name, and `hydrateUrl` does not care where the name came from.
      //
      // A route IS filtered, unlike a component, and the asymmetry is the level rule: nobody
      // hands a route a prop, so what it says about itself is the whole answer.
      const tags = new Set(discoverComponents(builds, io).map((c) => c.tag));
      for (const route of discoverReactiveRoutes(builds, io)) {
        // Two files that would be written to one name (§3.5). A pattern does not normally
        // produce a valid tag — `blog-slug` has no reason to be anybody's element — but
        // «normally» is not a guarantee, and a silent overwrite is a page that hydrates as
        // some other file.
        if (tags.has(route.name)) {
          this.error(
            `[${FUD_ROUTE_NAME_COLLISION}] the chunk of route ${route.pattern} would be named "${route.name}", which is already a component tag`,
          );
        }
        this.emitFile({
          type: 'chunk',
          id: clientId(route.path),
          name: clientChunkName(route.name),
          preserveSignature: 'strict',
        });
      }
    },

    resolveId(id) {
      if (id === MAIN_ID || id === BOOT_ID || id === SW_ID || id.startsWith(WRAPPER_PREFIX)) {
        return id;
      }
      // Only in dev: in build these names are real emitted files (see `DEV_SCRIPT_IDS`).
      if (isDev) {
        const path = pathnameOf(id, base);
        return DEV_SCRIPT_IDS.get(path) ?? devClientModuleId(path) ?? null;
      }
      return null;
    },

    load(id) {
      if (id === MAIN_ID) {
        // The Service Worker is what is conditional here, NEVER the hydration (SDD-17
        // §4.7.1). This used to return `export {};` whenever there was no worker, which
        // made "no SW" silently mean "no hydration" — and that is dev, and any project
        // without `sw.json`. One expression for dev and build: `/fudic-sw.js` has a fixed,
        // unhashed name because a Service Worker only controls its own directory and below.
        const hasWorker = swConfig !== null && (!isDev || swConfig.dev === 'preview');
        return emitMainBootstrap({
          chunks: isDev ? { mode: 'dev', urlPrefix: devClientPrefix(base) } : { mode: 'build', base },
          swUrlExpr: hasWorker ? JSON.stringify(devUrl(base, DEV_SW_URL)) : null,
          // One bootstrap for the whole app, so the question is the app's: if no component
          // anywhere writes a DI call, the module does not even name `@fudic/di/page`, and
          // the bundle has no chunk for it.
          hasDi: discoverComponents(builds, io).some((c) => c.usesDi),
        });
      }
      if (id === BOOT_ID) {
        // The half that is loaded unconditionally (BUG-31 §T2), so it carries the one thing
        // that must happen on every page: registering the worker. Empty when there is none.
        const hasWorker = swConfig !== null && (!isDev || swConfig.dev === 'preview');
        return emitBootBootstrap(hasWorker ? JSON.stringify(devUrl(base, DEV_SW_URL)) : null);
      }
      if (id === SW_ID) {
        return emitSwBootstrap({
          manifestUrlExpr: JSON.stringify(manifestUrl),
          shell: swConfig?.shell ?? [],
          resources: swConfig?.resources ?? [],
          // From the project's `fudic.json`, never from a plugin option: the identity of an
          // application belongs to the project (SDD-41 §3.3).
          app: appId,
        });
      }
      if (id.startsWith(WRAPPER_PREFIX)) {
        const pattern = id.slice(WRAPPER_PREFIX.length);
        const rb = builds.find((b) => b.route.pattern === pattern);
        if (rb === undefined) {
          return null;
        }
        return emitRenderChunk({
          pageModule: rb.absPath.replace(/\\/gu, '/'),
          hasLoad: rb.analysis.hasLoad,
          hasPaths: rb.analysis.hasPaths,
          hasLayout: rb.analysis.hasLayout,
          hasDi: routeUsesDi(rb.absPath, io),
          // In DEV this module IS the edge: the dev server renders through the module
          // graph and resolves data in process. In BUILD it is a chunk of the client
          // output, and the client never gets `load` (BUG-09 §4.1) — the edge pass builds
          // the variant that does, outside `outDir`.
          withLoad: isDev,
          // Dev has no build and no id: the two entries are served at their stable URLs.
          runtime: isDev
            ? { boot: devUrl(base, DEV_BOOT_URL), main: devUrl(base, DEV_MAIN_URL) }
            : runtimeUrls(base),
        });
      }
      // Nothing of ours: if the module is a built `dist/*.js` that ships its own map, hand
      // the map over with it so the chain reaches the `.ts`. `@fudic/core`'s `signal.js` is
      // the case that made this visible — the debugger showed the compiled JavaScript for a
      // file whose TypeScript was on disk, with its map, all along.
      return loadWithSourceMap(id);
    },

    async transform(code, id) {
      const { path, query } = splitId(id);
      if (!path.endsWith('.fud')) {
        // The schema of a form is an ordinary `.ts` that BOTH ends import, so the body of a
        // `serverValidator` would ship with the client unless it is taken out here (SDD-34
        // §4.7). This is the client build: the render graph lives in the edge pass, outside
        // `outDir`, and there the validators stay whole.
        const erased = /\.[cm]?[jt]sx?$/u.test(path) ? eraseServerValidators(code) : null;
        return erased === null ? null : { code: erased, map: null };
      }
      if (query === 'server') {
        // The `@server` region is TS (typed `load`/`paths`); strip types to plain JS so
        // the bundler parses it (Vite's own Oxc transform, as it does for any `.ts`).
        const code = emitServerModule(readFileSync(path, 'utf8'));
        const stripped = await transformWithOxc(code, `${path}.ts`, { lang: 'ts' });
        return stripped.map ? { code: stripped.code, map: stripped.map } : { code: stripped.code };
      }
      if (query === IOC_QUERY) {
        const ioc = transformFudIoc(path, io);
        // The `@code` is copied verbatim, so this module is TypeScript whenever the author
        // wrote TypeScript — the same strip `?client` and `?server` need.
        return ioc === null ? null : (await transformWithOxc(ioc.code, `${path}.ts`, { lang: 'ts' })).code;
      }
      if (query === CLIENT_QUERY) {
        const chunk = transformFudClient(path, io, projectStyles, linked);
        if (chunk === null) {
          return null;
        }
        for (const spec of chunk.missingAssets) {
          this.warn(`[${FUD_ASSET_NOT_FOUND}] asset "${spec}" not found (referenced by ${path})`);
        }
        // Same reason as `?server`: the `@code { @client }` region is copied VERBATIM, so
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
      const result = transformFud(path, io, routeNameOf(path), projectStyles, linked);
      if (result === null) {
        return null;
      }
      // A literal asset URL with no file on disk: warn (FUD0363) and keep the literal —
      // the emit already left it un-linked, so the build does not abort.
      for (const spec of result.missingAssets) {
        this.warn(`[${FUD_ASSET_NOT_FOUND}] asset "${spec}" not found (referenced by ${path})`);
      }
      // The `.fud` this module's markup came from that Vite cannot see: a snippet file is
      // not imported by the emitted code, it is expanded INTO it (SDD-29 §4.10), so without
      // this an edit to it would rebuild nothing.
      for (const file of result.watchFiles ?? []) this.addWatchFile(file);
      // Layout-chain diagnostics (SDD-21): a broken chain is an error, an unrendered
      // section a warning. Neither aborts the build — the other routes still compile.
      // A diagnostic that names another file says so: a snippet's body is reported in the
      // snippet's file, with the `@render` that pulled it in as the related location.
      for (const d of result.diagnostics) {
        const message = `[${d.code}] ${d.message} (${d.file ?? path})`;
        if (d.severity === 'error') this.error(message);
        else this.warn(message);
      }
      // Same reason as `?server` and `?client`: since SDD-34 the neutral zone of `@code`
      // reaches this module too, verbatim, so a `const f: Form<Post> = form(schema)` makes it
      // TypeScript. The three emitted modules are now stripped by the one rule.
      //
      // The `.fud` map goes IN as `inMap` and Oxc composes: `.fud` → TS → JS collapses to one
      // `.fud` → JS map that describes the code actually returned. It used to be handed over
      // as it stood, next to the STRIPPED code — a map of a text that no longer existed. It
      // resolved, it named the right `.fud`, and its offsets were fiction; the chunks it
      // produced came out with 3 mappings for 5 000 columns.
      const stripped = await transformWithOxc(
        result.code,
        `${path}.ts`,
        { lang: 'ts', sourcemap: true },
        result.map,
      );
      return stripped.map ? { code: stripped.code, map: stripped.map } : { code: stripped.code };
    },

    async generateBundle(_outputOptions, bundle) {
      // Every file name this build produces. The declared `shell` is checked against it
      // at the end: an entry that does not exist is a BUILD diagnostic (BUG-01 §4.4),
      // not something to swallow in the install's `catch` on the client.
      const emitted = new Set<string>(Object.keys(bundle));

      // 1. The link pass: the chunks the Service Worker will link by hand (§4.3).
      const link: LinkResult =
        swConfig === null
          ? { chunks: [], entries: new Map(), deps: new Map() }
          : await runLinkPass(root, base, builds, io, nested, projectStyles, linked);
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

      // 1b. The edge pass: the wrappers that run `@server load` in process. They are NOT
      //     emitted into the bundle — `emitFile` means "this gets published", and this is
      //     precisely what must not (BUG-09 §4.1). They are written beside `outDir` for the
      //     preview, and materialized into the prerender's temp dir below.
      // Written to disk in 3b, not here: an edge chunk imports the shared chunks by name and
      // those are renamed there (BUG-31 §T5), so what lands beside `outDir` — and what the
      // prerender runs — has to be the rewritten code.
      const edge = await runEdgePass(
        root,
        base,
        builds,
        io,
        resolveAlias,
        nested,
        projectStyles,
        linked,
      );

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
                  (entry.facadeModuleId === MAIN_ID || entry.facadeModuleId === BOOT_ID)
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
                // Non-empty by construction: a `sw.json` without an `id` is FUD0721 and
                // this build already failed in `buildStart` (SDD-41 §4.3).
                app: appId,
              },
              resolveAlias,
              nested,
            );

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
        if (item.type === 'chunk' && item.facadeModuleId === MAIN_ID) {
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
          (item.facadeModuleId.endsWith(`?${CLIENT_QUERY}`) ||
            item.facadeModuleId.endsWith(`?${IOC_QUERY}`)),
      );
      //     The SHARED chunks travel with them (BUG-31 §T5). They used to keep their content
      //     hash on the argument that the browser's HTTP cache could then skip them across
      //     deploys — but nothing in this architecture collects on that: `activate` deletes
      //     every cache that is not this build's, and the hydration chunks that import them
      //     change name on every build anyway. What the hash did cost was a manifest that had
      //     to write out 8 characters of noise per dependency, because a hashed name is a
      //     fact of the build and cannot be derived. Same length, so the offsets hold.
      const isEntry = (facade: string | null | undefined): boolean =>
        facade === MAIN_ID || facade === BOOT_ID;
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
      for (const d of rename.diagnostics) {
        this.warn(`[${d.code}] ${d.message}`);
      }
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
      for (const chunk of link.chunks) {
        emitWithMap({
          ...chunk,
          fileName: renames.get(chunk.fileName) ?? chunk.fileName,
          // The token too: a link chunk writes the runtime entry URLs into the head it
          // renders (BUG-31 §T1), and those carry the id.
          code: rewriteReferences(chunk.code.split(BUILD_TOKEN).join(buildId), renames),
        });
      }
      // The Service Worker, now that the names it precaches are the ones on disk. Its own
      // file name is fixed and unhashed, so only the code moves.
      if (sw !== null && swCode !== null) {
        emitWithMap({ ...sw, code: rewriteReferences(swCode, renames) });
      }
      // And the edge chunks, which the preview serves and the prerender runs from a temp dir
      // below: they import the same shared chunks by name.
      const edgeChunks = edge.chunks.map((c) => ({
        ...c,
        code: rewriteReferences(c.code.split(BUILD_TOKEN).join(buildId), renames),
      }));
      if (writeToDisk) {
        const edgeDir = resolvePath(root, EDGE_DIR);
        rmSync(edgeDir, { recursive: true, force: true });
        for (const chunk of edgeChunks) {
          const abs = join(edgeDir, chunk.fileName);
          mkdirSync(dirname(abs), { recursive: true });
          writeFileSync(abs, chunk.code);
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
            facade === MAIN_ID ||
            facade === BOOT_ID ||
            (facade?.endsWith(`?${CLIENT_QUERY}`) ?? false) ||
            (facade?.endsWith(`?${IOC_QUERY}`) ?? false)
          );
        },
      );
      for (const fileName of Object.keys(bundle)) {
        if (!keep.has(fileName)) {
          delete bundle[fileName];
          emitted.delete(fileName);
        }
      }

      // 3d. What each hydration chunk IMPORTS (SDD-17 §4.7). The URL of a tag's chunk is
      //     arithmetic, but the code the client pass shares between components keeps a
      //     content hash: nothing about it is derivable, and the only place that knows it
      //     is right here. Warming the tag's chunk alone left those imports to the network
      //     INSIDE the first gesture — measured, and the one place warm exists to keep clear.
      //
      //     Computed AFTER the rename and the prune, so the names are the ones published.
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
      for (const [key, item] of Object.entries(bundle)) {
        const tag =
          item.type === 'chunk' ? tagOfFacade.get(slashes(item.facadeModuleId ?? '')) : undefined;
        if (tag === undefined) {
          continue;
        }
        const deps = reachableChunks(items, (i) => i.fileName === key)
          .filter((fileName) => fileName !== key)
          .map((fileName) => bundle[fileName]?.fileName ?? fileName);
        if (deps.length > 0) {
          hydrateDeps[tag] = deps;
        }
      }

      // 4. The manifest: the one contract, emitted at a fixed URL.
      const { file, diagnostics } = buildManifest(builds, {
        build: buildId,
        base,
        serviceWorker: swConfig !== null,
        hydrateDeps,
        depsOf: (rb) => {
          if (!link.entries.has(rb.route.pattern)) {
            this.warn(`[${FUD_CHUNK_NOT_EMITTED}] no linkable chunk for ${rb.route.pattern}`);
            return null;
          }
          return chunkNamesOf(link.deps.get(rb.route.pattern) ?? []);
        },
      });
      for (const d of diagnostics) {
        this.warn(`[${d.code}] ${d.message} (${d.file})`);
      }
      this.emitFile({ type: 'asset', fileName: manifestFileName, source: JSON.stringify(file) });
      emitted.add(manifestFileName);

      // 5. Prerender: run each prerenderable route's BUILT chunk and write its `.html`.
      const prerenders = builds.filter((b) => b.decision.prerender);
      if (prerenders.length > 0) {
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
          for (const rb of prerenders) {
            const fileName = edge.entries.get(rb.route.pattern);
            if (fileName === undefined) {
              continue;
            }
            const chunkPath = join(dir, fileName);
            try {
              if (rb.decision.enumerate) {
                const { files, incomplete } = await prerenderEnumerated(chunkPath, rb.route.pattern);
                for (const f of files) {
                  this.emitFile({ type: 'asset', fileName: f.path, source: f.html });
                  emitted.add(f.path);
                }
                for (const bad of incomplete) {
                  this.warn(`[${FUD_PATHS_INCOMPLETE}] paths() entry ${bad} does not cover every param of ${rb.route.pattern}`);
                }
              } else if (!rb.route.pattern.includes(':')) {
                const html = await renderChunkToHtml(chunkPath, rb.route.pattern);
                this.emitFile({ type: 'asset', fileName: htmlPathFor(rb.route.pattern), source: html });
                emitted.add(htmlPathFor(rb.route.pattern));
              }
            } catch (err) {
              // A broken page BREAKS THE BUILD (SDD-39 §4.11). It used to warn and skip the
              // file, which shipped a site with one page missing and CI in green — a route
              // that throws while rendering is not a degradation, it is a page that does not
              // exist. No span: this is the build's diagnostic and not the file's.
              this.error(
                `[${FUD_PRERENDER_FAILED}] ${rb.route.pattern} failed to prerender: ${(err as Error).message}`,
              );
            }
          }
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      }

      // 5a. A public file somebody reached by a relative path (FUD0366). Reported here
      //     rather than at the transform because the passes repeat: the same `.fud` is
      //     compiled by the host, the link pass and the edge pass, and one mistake would
      //     be said three times.
      for (const url of linked.publicByPath()) {
        this.error(
          `[${FUD_PUBLIC_BY_PATH}] A public file is named by its URL, not by a path into the public directory: ` +
            `write "${url}". Reaching it with a relative path publishes a second, hashed copy of a file ` +
            'that is already served under its own name.',
        );
      }

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
      for (const entry of missingShellEntries(swConfig?.shell ?? [], base, emitted, publicDir)) {
        this.warn(`[${FUD_SW_SHELL_MISSING}] shell entry "${entry}" is not in the build output`);
      }
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

/** First-hit match of a manifest record against a concrete path (preview server). */
function matchRecord(routes: readonly RouteRecord[], pathname: string): RouteRecord | null {
  const parts = pathname.split('/').filter((s) => s.length > 0);
  for (const record of routes) {
    const pattern = record.pattern.split('/').filter((s) => s.length > 0);
    if (pattern.length === parts.length && pattern.every((seg, i) => seg.startsWith(':') || seg === parts[i])) {
      return record;
    }
  }
  return null;
}

/** Where a route's edge wrapper lives: by convention, outside `outDir` (BUG-09 §3.2). */
function edgeChunkPath(root: string, pattern: string): string {
  return join(resolvePath(root, EDGE_DIR), `${safeName(pattern)}.js`);
}

/**
 * Import a route's built EDGE wrapper — by CONVENTION, from outside `outDir`.
 *
 * It used to be `join(outDir, record.esm)`: a URL published in the manifest, pointing at a
 * file inside the directory a static host serves. That is the shape BUG-09 removes. The
 * name is derived exactly as the edge pass derives it, so nothing has to be announced.
 */
async function importEdgeChunk(root: string, pattern: string): Promise<RenderModule> {
  const { pathToFileURL } = await import('node:url');
  return (await import(pathToFileURL(edgeChunkPath(root, pattern)).href)) as RenderModule;
}

/** Render a route in preview by importing its built ESM chunk. */
async function previewRender(
  root: string,
  record: RouteRecord,
  pathname: string,
  nonce: string,
): Promise<string> {
  const mod = await importEdgeChunk(root, record.pattern);
  const { drainStream, edgeContext } = await import('./serve.js');
  return drainStream(mod.render(edgeContext(record.pattern, pathname, nonce)));
}

/** Run a route's `@server load` in preview — the generated data endpoint. */
async function previewData(
  root: string,
  record: RouteRecord,
  pathname: string,
): Promise<unknown> {
  const mod = await importEdgeChunk(root, record.pattern);
  if (typeof mod.data !== 'function') {
    return {};
  }
  const { edgeContext } = await import('./serve.js');
  const { nonce: _nonce, ...ctx } = edgeContext(record.pattern, pathname, '');
  return mod.data(ctx);
}
