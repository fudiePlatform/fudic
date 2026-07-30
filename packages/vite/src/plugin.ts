/**
 * The fudic Vite plugin (SDD-19 §3.1, rewired by SDD-20). The LINKER over the fs-free
 * compiler emit: it discovers page `.fud` under `routesDir`, transforms every `.fud` to
 * a module (Vite owns the graph), emits one wrapper per route in TWO formats — ESM for
 * the edge and prerender, `exports`/`require` for the Service Worker's own linker — the
 * manifest both sides read, and the two bootstraps.
 *
 * Vite is bundler and dev server only; the parser is always `@fudic/compiler`.
 */

import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
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
import { emitMainBootstrap, emitSwBootstrap } from './bootstrap.js';
import { transformFud } from './transform.js';
import { nodeIo } from './io.js';
import { readSwConfig, type ResolvedSwConfig } from './swconfig.js';
import { runLinkPass, safeName, type LinkResult } from './link.js';
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
  FUD_SW_SHELL_MISSING,
} from './diagnostics.js';
import { devUrl, devManifest } from './dev.js';
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
  DATA_PREFIX,
  BUILD_TOKEN,
  BUILD_ID_LENGTH,
  DEV_MAIN_URL,
  DEV_SW_URL,
} from './constants.js';

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

export function fudic(userOptions: FudicOptions = {}): Plugin {
  let options: ResolvedOptions;
  let root = process.cwd();
  let base = '/';
  let outDir = '';
  let publicDir = '';
  let isDev = false;
  let builds: readonly RouteBuild[] = [];
  let swConfig: ResolvedSwConfig | null = null;
  const wrapperRefs = new Map<string, string>(); // route pattern → emitFile referenceId
  let resolveAlias: unknown;
  // What the two nested builds inherit from the host (BUG-05 §3.1). BUG-06 adds `minify`.
  let nested: NestedOutputOptions = { sourcemap: false };
  let manifestUrl = '/fudic-routes.json';
  let manifestFileName = 'fudic-routes.json';
  const io = nodeIo();

  return {
    name: 'fudic',

    config(userConfig) {
      // The app is the client shell: the main-thread bootstrap is the entry. Two files
      // need STABLE, ROOT-LEVEL names — the same URLs the dev server publishes:
      //  - `fudic-sw.js`: a Service Worker only controls its own directory and below;
      //  - `fudic-main.js`: a page references it literally in a `<script src>`.
      // `fudic-sw.js` is NOT a chunk of this output any more: it has its own build, so
      // nothing here has to pin its name (BUG-03 §4.1). `chunkFileNames` goes back to
      // Vite's default.
      const hasOutputConfig = userConfig?.build?.rollupOptions?.output !== undefined;
      const pinned = (fixed: string) => (chunk: { name: string }) =>
        chunk.name === fixed ? `${fixed}.js` : 'assets/[name]-[hash].js';
      return {
        appType: 'custom',
        build: {
          rollupOptions: {
            input: { 'fudic-main': MAIN_ID },
            ...(hasOutputConfig ? {} : { output: { entryFileNames: pinned('fudic-main') } }),
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
      isDev = config.command === 'serve';
      // Forwarded to the Service Worker's nested build, which runs `configFile: false`.
      resolveAlias = config.resolve?.alias;
      // A nested build inherits the host's OUTPUT configuration; what it does not inherit
      // is a decision, not an oversight (BUG-05 §4.1). `build.sourcemap` was neither
      // applied nor reported: the option simply did nothing for these two outputs.
      nested = { sourcemap: config.build.sourcemap };
      options = resolveOptions(userOptions, config.base).options;
      manifestUrl = options.manifestUrl;
      manifestFileName = manifestUrl.startsWith(base) ? manifestUrl.slice(base.length) : 'fudic-routes.json';
      // No `sw.json`, no Service Worker: everything is server/SSG (SDD-20 §4.7).
      swConfig = readSwConfig(root, {
        exists: (p) => existsSync(p),
        read: (p) => readFileSync(p, 'utf8'),
      }).config;
    },

    configureServer(server) {
      builds = discoverRoutes(root, options).routes;
      // Dev serves the bootstraps at stable root URLs (so the SW would register at root
      // scope), but registers nothing unless `sw.json` says `"dev": "preview"` (§4.11).
      const scripts = new Map<string, string>([
        [devUrl(base, DEV_MAIN_URL), MAIN_ID],
        [devUrl(base, DEV_SW_URL), SW_ID],
      ]);
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0] ?? '';
        if (url === manifestUrl) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(devManifest(builds)));
          return;
        }
        const id = scripts.get(url);
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
            res.end(result?.code ?? '');
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
          if (dataRecord?.esm === undefined) {
            next();
            return;
          }
          previewData(outDir, dataRecord, routePath)
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
        if (record.esm === undefined) {
          next();
          return;
        }
        previewRender(outDir, record, pathname, nonce)
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
      const discovered = discoverRoutes(root, options);
      builds = discovered.routes;
      for (const d of discovered.diagnostics) {
        this.warn(`[${d.code}] ${d.message}`);
      }
      if (isDev) {
        // Dev has no emitFile/generateBundle: the module graph serves the wrappers and
        // bootstraps, and configureServer serves the manifest.
        return;
      }

      for (const rb of builds) {
        if (rb.decision.mode === 'excluded') {
          continue;
        }
        wrapperRefs.set(
          rb.route.pattern,
          this.emitFile({
            type: 'chunk',
            id: WRAPPER_PREFIX + rb.route.pattern,
            name: `c/${safeName(rb.route.pattern)}`,
            // Imported at runtime through the manifest, not via a static import Rollup
            // can see — keep its exports.
            preserveSignature: 'strict',
          }),
        );
      }
    },

    resolveId(id) {
      if (id === MAIN_ID || id === SW_ID || id.startsWith(WRAPPER_PREFIX)) {
        return id;
      }
      return null;
    },

    load(id) {
      if (id === MAIN_ID) {
        if (swConfig === null || (isDev && swConfig.dev !== 'preview')) {
          // No Service Worker: nothing for the main thread to do (§4.7, §4.11).
          return 'export {};\n';
        }
        // One expression for dev and build: `/fudic-sw.js` has a fixed, unhashed name
        // because a Service Worker only controls its own directory and below (§4.2).
        return emitMainBootstrap(JSON.stringify(devUrl(base, DEV_SW_URL)));
      }
      if (id === SW_ID) {
        return emitSwBootstrap({
          manifestUrlExpr: JSON.stringify(manifestUrl),
          shell: swConfig?.shell ?? [],
          resources: swConfig?.resources ?? [],
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
          withLoad: true, // the edge resolves data in process
        });
      }
      return null;
    },

    async transform(_code, id) {
      const { path, query } = splitId(id);
      if (!path.endsWith('.fud')) {
        return null;
      }
      if (query === 'server') {
        // The `@server` region is TS (typed `load`/`paths`); strip types to plain JS so
        // the bundler parses it (Vite's own Oxc transform, as it does for any `.ts`).
        const code = emitServerModule(readFileSync(path, 'utf8'));
        const stripped = await transformWithOxc(code, `${path}.ts`, { lang: 'ts' });
        return stripped.map ? { code: stripped.code, map: stripped.map } : { code: stripped.code };
      }
      const result = transformFud(path, io);
      if (result === null) {
        return null;
      }
      // A literal asset URL with no file on disk: warn (FUD0363) and keep the literal —
      // the emit already left it un-linked, so the build does not abort.
      for (const spec of result.missingAssets) {
        this.warn(`[${FUD_ASSET_NOT_FOUND}] asset "${spec}" not found (referenced by ${path})`);
      }
      // Layout-chain diagnostics (SDD-21): a broken chain is an error, an unrendered
      // section a warning. Neither aborts the build — the other routes still compile.
      for (const d of result.diagnostics) {
        const message = `[${d.code}] ${d.message} (${path})`;
        if (d.severity === 'error') this.error(message);
        else this.warn(message);
      }
      return { code: result.code, map: JSON.stringify(result.map) };
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
          : await runLinkPass(root, base, builds, io, nested);
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
      for (const chunk of link.chunks) {
        emitWithMap(chunk);
      }

      // 2. The Service Worker's own bundle: one realm, one bundle (BUG-03 §4.1). Its
      //    code still carries BUILD_TOKEN — the id is computed from it, below.
      const sw =
        swConfig === null
          ? null
          : await buildServiceWorker(
              root,
              base,
              {
                manifestUrlExpr: JSON.stringify(manifestUrl),
                shell: swConfig.shell,
                resources: swConfig.resources,
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
      if (sw !== null) {
        // Substituted in the SW's code BEFORE emitting it. A surviving token produces
        // caches called `shell-<token>` that `isStaleCache` never purges — silently,
        // forever. That is what §6.4 exists to catch.
        //
        // The id measures exactly what the token measures, so this rewrite preserves every
        // offset and the map generated for `sw.code` still describes what is emitted
        // (BUG-05 §4.4).
        emitWithMap({ ...sw, code: sw.code.split(BUILD_TOKEN).join(buildId) });
      }

      // 4. The manifest: the one contract, emitted at a fixed URL.
      const urlOf = (fileName: string): string => `${base}${fileName}`.replace(/\/{2,}/gu, '/');
      const esmOf = (rb: RouteBuild): string => {
        const ref = wrapperRefs.get(rb.route.pattern);
        return ref === undefined ? '' : urlOf(this.getFileName(ref));
      };
      const { file, diagnostics } = buildManifest(builds, {
        build: buildId,
        base,
        serviceWorker: swConfig !== null,
        esmOf,
        linkChunkOf: (rb) => {
          const fileName = link.entries.get(rb.route.pattern);
          if (fileName === undefined) {
            this.warn(`[${FUD_CHUNK_NOT_EMITTED}] no linkable chunk for ${rb.route.pattern}`);
            return '';
          }
          return urlOf(fileName);
        },
        depsOf: (rb) => (link.deps.get(rb.route.pattern) ?? []).map(urlOf),
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
          for (const rb of prerenders) {
            const ref = wrapperRefs.get(rb.route.pattern);
            if (ref === undefined) {
              continue;
            }
            const chunkPath = join(dir, this.getFileName(ref));
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
              // A broken page must not abort the build: warn and skip its file.
              this.warn(`[prerender] ${rb.route.pattern}: ${(err as Error).message}`);
            }
          }
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
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

/** Import a route's built ESM chunk (the edge half of the two output formats). */
async function importEsmChunk(outDir: string, record: RouteRecord): Promise<RenderModule> {
  const { pathToFileURL } = await import('node:url');
  const file = join(outDir, (record.esm ?? '').replace(/^\//u, ''));
  return (await import(pathToFileURL(file).href)) as RenderModule;
}

/** Render a route in preview by importing its built ESM chunk. */
async function previewRender(
  outDir: string,
  record: RouteRecord,
  pathname: string,
  nonce: string,
): Promise<string> {
  const mod = await importEsmChunk(outDir, record);
  const { drainStream, edgeContext } = await import('./serve.js');
  return drainStream(mod.render(edgeContext(record.pattern, pathname, nonce)));
}

/** Run a route's `@server load` in preview — the generated data endpoint. */
async function previewData(
  outDir: string,
  record: RouteRecord,
  pathname: string,
): Promise<unknown> {
  const mod = await importEsmChunk(outDir, record);
  if (typeof mod.data !== 'function') {
    return {};
  }
  const { edgeContext } = await import('./serve.js');
  const { nonce: _nonce, ...ctx } = edgeContext(record.pattern, pathname, '');
  return mod.data(ctx);
}
