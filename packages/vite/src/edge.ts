/**
 * The EDGE PASS (BUG-09 §3.1): the route wrappers that run on the SERVER — prerender at
 * build time, `vite preview`, and one day a real edge deployment.
 *
 * It exists because of where its output must NOT go. These wrappers call `@server load(ctx)`
 * in process, so their module graph pulls in the `@server` region and everything it
 * imports: database clients, tokens, internal URLs. They used to be emitted with
 * `this.emitFile({ type: 'chunk' })`, which made them chunks of the CLIENT build — published
 * under `/assets/`, announced by the manifest and served by any static host.
 *
 * So this is a third nested build, like the Service Worker's and the link pass's, and for
 * a reason of the same family: its output is consumed by someone who is not the browser.
 * The plugin writes it OUTSIDE `outDir`, because `outDir` is what gets published.
 *
 * `withLoad: true` is what separates it from the link pass, which emits the same routes
 * with `withLoad: false` precisely so the Service Worker never receives server code. That
 * difference is also why this pass needs the host's `resolve.alias`: its wrappers BUNDLE
 * `@fudic/ssr` instead of leaving it external, so they have to be able to resolve it.
 */

import { build, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { transformWithOxc } from 'vite';
import { type ResolveIo } from '@fudic/compiler';
import { type RouteBuild } from './discover.js';
import { emitRenderChunk } from './wrapper.js';
import { runtimeUrls, type RuntimeEntries } from './constants.js';
import { loadWithSourceMap } from './inputmaps.js';
import { routeNameLookup, routeUsesDi } from './client.js';
import { emitServerModule } from './server.js';
import { NO_STYLES, type ProjectStyles } from './transform.js';
import { compileFud } from './compile.js';
import type { BuildReporter } from './report.js';
import { safeName } from './link.js';
import { EDGE_PREFIX, FUNCTIONS_FILE, FUNCTIONS_ID } from './constants.js';
import { serializeMap, type NestedArtifact, type NestedOutputOptions } from './nested.js';
import { LinkedAssets } from './linked-assets.js';
import { alternatesOf, localePlugin, localeTarget, pageModuleOf, type LocaleContext } from './i18n.js';

/** The input name of `functions.mjs`. */
const FUNCTIONS_ENTRY = 'functions';

export interface EdgeResult {
  /** Every emitted file, in no particular order. Written outside `outDir` by the caller. */
  readonly chunks: readonly NestedArtifact[];
  /** Route pattern → its entry file name, relative to the edge directory. */
  readonly entries: ReadonlyMap<string, string>;
}

const EMPTY: EdgeResult = { chunks: [], entries: new Map() };

/** What the edge pass builds besides the routes (SDD-56). */
export interface EdgeExtras {
  /**
   * `_error.fud`, rendered under `/_fudic/error/:status` and in no route table: once per
   * locale, each under its own pattern, when the app has two or more (SDD-58 §4.5).
   */
  readonly errorPages?: readonly RouteBuild[];
  /** The app's locales, when it has them (SDD-58 §4.6): each route compiled for its own. */
  readonly locale?: LocaleContext;
  /** The text of the `functions.mjs` module, when the app has server functions. */
  readonly functions?: string;
  /** `src/http.ts`, the global level of every chain, when the project has one. */
  readonly globalChain?: string;
}

const BUILTINS = new Set(builtinModules);

/** `node:async_hooks`, and `fs` written without its prefix. */
export function isNodeBuiltin(id: string): boolean {
  return id.startsWith('node:') || BUILTINS.has(id);
}

/** Structural view of a bundler output; see the same note in the link pass. */
interface OutputChunkLike {
  readonly type: string;
  readonly fileName: string;
  readonly code?: string;
  readonly map?: unknown;
  readonly isEntry?: boolean;
  readonly facadeModuleId?: string | null;
}
interface BundleOutputLike {
  readonly output: readonly OutputChunkLike[];
}

/**
 * The plugin of the nested build. It serves the wrappers, compiles `.fud`, and — unlike
 * the link pass's — has to handle the `?server` module too: the edge wrapper is the only
 * consumer that imports it, and it is TypeScript.
 */
export function edgePlugin(
  builds: readonly RouteBuild[],
  io: ResolveIo,
  base: string,
  styles: ProjectStyles = NO_STYLES,
  assets?: LinkedAssets,
  runtimeFor: (pattern: string) => RuntimeEntries = () => runtimeUrls(base, ''),
  /** The host's reporter: what this pass compiles again is not said twice (SDD-35 §4.4). */
  reporter?: BuildReporter,
  extras: EdgeExtras = {},
): Plugin {
  // Resolved once for the pass: the render module of a route publishes its name (SDD-39
  // §4.7), and this pass renders the very pages the prerender writes.
  const routeNameOf = routeNameLookup(builds, io);
  const renderable = [...builds, ...(extras.errorPages ?? [])];
  // Modules whose text the pass already has: `functions.mjs`, only when there are functions.
  const fixed = new Map<string, string>();
  if (extras.functions !== undefined) fixed.set(FUNCTIONS_ID, extras.functions);
  return {
    name: 'fudic:edge',
    resolveId(id) {
      return id.startsWith(EDGE_PREFIX) || fixed.has(id) ? id : null;
    },
    load(id) {
      const text = fixed.get(id);
      if (text !== undefined) return text;
      if (!id.startsWith(EDGE_PREFIX)) {
        return loadWithSourceMap(id);
      }
      const pattern = id.slice(EDGE_PREFIX.length);
      const rb = renderable.find((b) => b.route.pattern === pattern);
      if (rb === undefined) {
        return null;
      }
      return emitRenderChunk({
        pageModule: pageModuleOf(rb),
        hasLoad: rb.analysis.hasLoad,
        hasPaths: rb.analysis.hasPaths,
        hasLayout: rb.analysis.hasLayout,
        hasDi: routeUsesDi(rb.absPath, io),
        hasHttp: rb.analysis.hasHttp === true,
        fluentLoad: rb.analysis.fluentLoad === true,
        ...(extras.globalChain !== undefined ? { globalChain: extras.globalChain } : {}),
        withLoad: true, // the edge resolves data in process
        runtime: runtimeFor(pattern),
        ...alternatesOf(rb, extras.locale?.locales, base),
      });
    },
    async transform(_code, id) {
      const target = localeTarget(extras.locale, io, id);
      const { path, query } = target;
      if (!path.endsWith('.fud')) {
        return null;
      }
      if (query === 'server') {
        // The `@server` region is TS: strip the types so the bundler parses it, exactly as
        // the host plugin does for the dev and prerender paths.
        const stripped = await transformWithOxc(emitServerModule(target.locale === undefined ? readFileSync(path, 'utf8') : target.io.read(path)), `${path}.ts`, {
          lang: 'ts',
        });
        /* v8 ignore next -- Oxc always returns a map for a `.ts` input; the guard is for the type, not for a case. */
        return stripped.map ? { code: stripped.code, map: stripped.map } : { code: stripped.code };
      }
      // The same module the host bundle compiled, from the build's memory (`compileFud`).
      const compiled = await compileFud(path, target.io, routeNameOf(path, target.locale), styles, assets, target.i18n);
      /* v8 ignore next -- `compileFud` returns null only for a non-`.fud` id, and that was checked above. */
      if (compiled === null) return null;
      // What the emit had to say about the file, which this pass used to drop (SDD-35 §1.1).
      reporter?.report(this, compiled.result.diagnostics, path);
      // With its map: the edge chunks are the ones a `@server load` stack trace comes from.
      return compiled.module;
    },
  };
}

/**
 * Run the edge pass for every route that is not excluded.
 *
 * Entry file names are stable and unhashed — `<safeName>.js` — because nothing caches
 * them: they are read from disk by Node, by name, and never fetched over HTTP. That is
 * also what lets `vite preview` find a route's wrapper by convention instead of through a
 * URL published in the manifest.
 */
export async function runEdgePass(
  root: string,
  base: string,
  builds: readonly RouteBuild[],
  io: ResolveIo,
  alias: unknown,
  nested: NestedOutputOptions,
  styles: ProjectStyles = NO_STYLES,
  assets: LinkedAssets = new LinkedAssets(base),
  /**
   * What a route's head is handed about the runtime (SDD-45 §4.4, §4.5). See `runLinkPass`
   * for why it is passed in rather than computed.
   */
  runtimeFor: (pattern: string) => RuntimeEntries = () => runtimeUrls(base, ''),
  /** Where this pass reports what it compiles; the host's, so nothing is said twice. */
  reporter?: BuildReporter,
  extras: EdgeExtras = {},
): Promise<EdgeResult> {
  const routes = builds.filter((rb) => rb.decision.mode !== 'excluded');
  if (routes.length === 0 && extras.functions === undefined) {
    return EMPTY;
  }

  const input: Record<string, string> = {};
  for (const rb of routes) {
    input[safeName(rb.route.pattern)] = EDGE_PREFIX + rb.route.pattern;
  }
  for (const page of extras.errorPages ?? []) {
    input[safeName(page.route.pattern)] = EDGE_PREFIX + page.route.pattern;
  }
  if (extras.functions !== undefined) input[FUNCTIONS_ENTRY] = FUNCTIONS_ID;

  const output = (await build({
    configFile: false,
    root,
    base,
    logLevel: 'error',
    plugins: [
      ...(extras.locale === undefined ? [] : [localePlugin(extras.locale)]),
      edgePlugin(routes, io, base, styles, assets, runtimeFor, reporter, extras),
    ],
    // Forwarded verbatim, for the same reason as the Service Worker's build: this one runs
    // with `configFile: false`, so a project that resolves `@fudic/*` through aliases —
    // every project the CLI scaffolds — would not resolve them here.
    ...(alias === undefined ? {} : { resolve: { alias: alias as never } }),
    build: {
      write: false,
      emptyOutDir: false,
      // The one nested build that does NOT inherit `nested.minify`, and the reason is
      // written down because that is the rule (BUG-06 §5). This output is never
      // published — it is written outside `outDir` and read by Node, for the prerender
      // and for `vite preview` (BUG-09 §4.1). `build.minify` is a decision about the
      // bytes a user downloads, and no user downloads these. What minifying them would
      // cost is real: a `@server load` that throws during the prerender is a stack trace
      // someone has to read.
      minify: false,
      sourcemap: nested.sourcemap !== false,
      // Node runs this output, and Vite's preload helper wraps every dynamic `import()` in
      // code that touches `document`: `functions.mjs` would answer 500 to every call.
      modulePreload: false,
      rollupOptions: {
        input,
        // Node reads this output, so its builtins stay imports: bundled, each one would be
        // the browser stub Vite leaves in their place — `AsyncLocalStorage` behind every
        // `inject()` of a request (SDD-56 §4.6), or a `node:crypto` of a `@server`.
        external: isNodeBuiltin,
        // `render`, `data` and `paths` are reached through the manifest and by the
        // prerender, never through a static import the bundler can see.
        preserveEntrySignatures: 'strict',
        output: {
          format: 'es',
          // `functions.mjs` by name: an adapter mounts it, and the extension says it is ESM to
          // a Node that has no `package.json` to ask in `.fudic/edge`.
          entryFileNames: (chunk: { readonly name: string }) =>
            chunk.name === FUNCTIONS_ENTRY ? FUNCTIONS_FILE : '[name].js',
          chunkFileNames: 'c/[name]-[hash].js',
        },
      },
    },
  })) as unknown as BundleOutputLike;

  const chunks: NestedArtifact[] = [];
  const entries = new Map<string, string>();
  const byModuleId = new Map<string, string>();

  for (const item of output.output) {
    if (item.type !== 'chunk') {
      continue;
    }
    /* v8 ignore next -- a bundler item of type `chunk` always carries its code. */
    const code = item.code ?? '';
    const map = serializeMap(item.map);
    chunks.push(
      map === undefined
        ? { fileName: item.fileName, code }
        : { fileName: item.fileName, code, map },
    );
    if (item.isEntry === true && item.facadeModuleId != null) {
      byModuleId.set(item.facadeModuleId, item.fileName);
    }
  }

  for (const rb of routes) {
    const fileName = byModuleId.get(EDGE_PREFIX + rb.route.pattern);
    /* v8 ignore next -- every listed route is an input of this build, so it has an entry chunk. */
    if (fileName !== undefined) {
      entries.set(rb.route.pattern, fileName);
    }
  }

  return { chunks, entries };
}
