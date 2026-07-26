/**
 * The fudic Vite plugin (SDD-19 §3.1). The LINKER over the fs-free compiler emit:
 * it discovers page `.fud` under `routesDir`, transforms every `.fud` to a module
 * (Vite owns the graph), emits a `RenderChunk` wrapper per route, the `route→chunk`
 * manifest `@fudic/transport` loads, and the three-thread bootstraps (SW/WW/main).
 * Vite is bundler/dev-server only — the parser is always `@fudic/compiler`.
 */

import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Plugin, transformWithOxc } from 'vite';
import { type FudicOptions, type ResolvedOptions, resolveOptions } from './options.js';
import { discoverRoutes, type RouteBuild } from './discover.js';
import { buildManifest } from './manifest.js';
import { emitRenderChunk } from './wrapper.js';
import { emitServerModule } from './server.js';
import { emitWwBootstrap, emitSwBootstrap, emitMainBootstrap } from './bootstrap.js';
import { transformFud } from './transform.js';
import { nodeIo } from './io.js';
import {
  htmlPathFor,
  materializeBundle,
  renderChunkToHtml,
  prerenderEnumerated,
  type BundleItem,
} from './prerender.js';
import { FUD_PATHS_INCOMPLETE, FUD_ASSET_NOT_FOUND } from './diagnostics.js';
import { devUrl, devManifest } from './dev.js';
import {
  WRAPPER_PREFIX,
  WW_ID,
  SW_ID,
  MAIN_ID,
  CACHE_NAME,
  DEV_MAIN_URL,
  DEV_SW_URL,
  DEV_WW_URL,
} from './constants.js';

/** A `import.meta.ROLLUP_FILE_URL_<ref>` expression: Rollup fills the real hashed URL. */
const fileUrl = (ref: string): string => `import.meta.ROLLUP_FILE_URL_${ref}`;

/** A filesystem-safe chunk base name from a route pattern. */
function safeName(pattern: string): string {
  const s = pattern.replace(/[^a-z0-9]+/giu, '-').replace(/^-+|-+$/gu, '');
  return s.length > 0 ? s : 'index';
}

/** Split a module id into its path and query (without the `?`). */
function splitId(id: string): { path: string; query: string } {
  const q = id.indexOf('?');
  return q === -1 ? { path: id, query: '' } : { path: id.slice(0, q), query: id.slice(q + 1) };
}

export function fudic(userOptions: FudicOptions = {}): Plugin {
  let options: ResolvedOptions;
  let root = process.cwd();
  let base = '/';
  let isDev = false;
  let builds: readonly RouteBuild[] = [];
  const wrapperRefs = new Map<string, string>(); // route pattern → emitFile referenceId
  let wwRef = '';
  let swRef = '';
  let manifestUrl = '/fudic-routes.json';
  let manifestFileName = 'fudic-routes.json';
  const io = nodeIo();

  return {
    name: 'fudic',

    config() {
      // The app is the three-thread shell: the main-thread bootstrap is the entry.
      return {
        appType: 'custom',
        build: { rollupOptions: { input: { 'fudic-main': MAIN_ID } } },
      };
    },

    configResolved(config) {
      root = config.root;
      base = config.base;
      isDev = config.command === 'serve';
      options = resolveOptions(userOptions, config.base).options;
      manifestUrl = options.manifestUrl;
      // The manifest is emitted at a FIXED path (SW and WW load the same absolute URL).
      manifestFileName = manifestUrl.startsWith(base) ? manifestUrl.slice(base.length) : 'fudic-routes.json';
    },

    configureServer(server) {
      builds = discoverRoutes(root, options).routes;
      // The three bootstraps served at stable root URLs (so the SW registers at root
      // scope); their code comes from the same virtual modules, transformed by Vite.
      const scripts = new Map<string, string>([
        [devUrl(base, DEV_MAIN_URL), MAIN_ID],
        [devUrl(base, DEV_SW_URL), SW_ID],
        [devUrl(base, DEV_WW_URL), WW_ID],
      ]);
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0] ?? '';
        if (url === manifestUrl) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(devManifest(builds, base)));
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
              res.setHeader('Service-Worker-Allowed', base); // let the SW claim root scope
            }
            res.end(result?.code ?? '');
          })
          .catch((err) => {
            res.statusCode = 500;
            res.end(`// fudic dev: failed to serve ${url}: ${(err as Error).message}`);
          });
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
        // bootstraps, and configureServer serves the manifest (SDD-19 §4.10).
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
            // The WW imports this chunk at runtime via the manifest URL, not via a
            // static import Rollup can see — keep its default export (RenderChunk).
            preserveSignature: 'strict',
          }),
        );
      }
      wwRef = this.emitFile({ type: 'chunk', id: WW_ID, name: 'fudic-ww' });
      swRef = this.emitFile({ type: 'chunk', id: SW_ID, name: 'fudic-sw' });
    },

    resolveId(id) {
      if (id === MAIN_ID || id === WW_ID || id === SW_ID || id.startsWith(WRAPPER_PREFIX)) {
        return id;
      }
      return null;
    },

    load(id) {
      // Dev references stable root URLs (configureServer serves them); build references
      // the hashed chunks via `import.meta.ROLLUP_FILE_URL_<ref>`.
      if (id === MAIN_ID) {
        const swUrl = isDev ? JSON.stringify(devUrl(base, DEV_SW_URL)) : fileUrl(swRef);
        return emitMainBootstrap(swUrl);
      }
      if (id === WW_ID) {
        return emitWwBootstrap(JSON.stringify(manifestUrl));
      }
      if (id === SW_ID) {
        const wwUrl = isDev ? JSON.stringify(devUrl(base, DEV_WW_URL)) : fileUrl(wwRef);
        return emitSwBootstrap(JSON.stringify(manifestUrl), wwUrl, CACHE_NAME);
      }
      if (id.startsWith(WRAPPER_PREFIX)) {
        const pattern = id.slice(WRAPPER_PREFIX.length);
        const rb = builds.find((b) => b.route.pattern === pattern);
        if (rb === undefined) {
          return null;
        }
        return emitRenderChunk({
          pageModule: rb.absPath.replace(/\\/gu, '/'),
          pattern,
          hasLoad: rb.analysis.hasLoad,
          hasPaths: rb.analysis.hasPaths,
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
      // the emit already left it un-linked, so the build does not abort (§6.13).
      for (const spec of result.missingAssets) {
        this.warn(`[${FUD_ASSET_NOT_FOUND}] asset "${spec}" not found (referenced by ${path})`);
      }
      // The map is passed as a JSON string (a valid Vite `SourceMapInput`), which also
      // sidesteps the readonly/mutable array mismatch with Rollup's raw-map type.
      return { code: result.code, map: JSON.stringify(result.map) };
    },

    async generateBundle(_outputOptions, bundle) {
      const chunkOf = (rb: RouteBuild): string => {
        const ref = wrapperRefs.get(rb.route.pattern);
        return ref === undefined ? '' : base + this.getFileName(ref);
      };
      // Fixed path so SW and WW load the SAME absolute manifest URL (SDD-19 §4.7).
      this.emitFile({
        type: 'asset',
        fileName: manifestFileName,
        source: JSON.stringify(buildManifest(builds, chunkOf)),
      });

      // Static prerender (mode 1, §4.4): run each prerenderable route's built RenderChunk
      // and emit its `.html`. A param route with `paths()` (decision.enumerate) prerenders
      // one file per enumerated id; a param-free static route prerenders its single file.
      const prerenders = builds.filter((b) => b.decision.prerender);
      if (prerenders.length === 0) {
        return;
      }
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
              }
              for (const bad of incomplete) {
                this.warn(`[${FUD_PATHS_INCOMPLETE}] paths() entry ${bad} does not cover every param of ${rb.route.pattern}`);
              }
            } else if (!rb.route.pattern.includes(':')) {
              const html = await renderChunkToHtml(chunkPath, rb.route.pattern);
              this.emitFile({ type: 'asset', fileName: htmlPathFor(rb.route.pattern), source: html });
            }
          } catch (err) {
            // A broken page must not abort the build (invariant §5): warn and skip its file.
            this.warn(`[prerender] ${rb.route.pattern}: ${(err as Error).message}`);
          }
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
