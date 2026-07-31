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
import { transformWithOxc } from 'vite';
import { type ResolveIo } from '@fudic/compiler';
import { type RouteBuild } from './discover.js';
import { emitRenderChunk } from './wrapper.js';
import { emitServerModule } from './server.js';
import { transformFud } from './transform.js';
import { safeName } from './link.js';
import { EDGE_PREFIX } from './constants.js';
import { serializeMap, type NestedArtifact, type NestedOutputOptions } from './nested.js';

export interface EdgeResult {
  /** Every emitted file, in no particular order. Written outside `outDir` by the caller. */
  readonly chunks: readonly NestedArtifact[];
  /** Route pattern → its entry file name, relative to the edge directory. */
  readonly entries: ReadonlyMap<string, string>;
}

const EMPTY: EdgeResult = { chunks: [], entries: new Map() };

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
export function edgePlugin(builds: readonly RouteBuild[], io: ResolveIo): Plugin {
  return {
    name: 'fudic:edge',
    resolveId(id) {
      return id.startsWith(EDGE_PREFIX) ? id : null;
    },
    load(id) {
      if (!id.startsWith(EDGE_PREFIX)) {
        return null;
      }
      const pattern = id.slice(EDGE_PREFIX.length);
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
    },
    async transform(_code, id) {
      const [path = id, query] = id.split('?');
      if (!path.endsWith('.fud')) {
        return null;
      }
      if (query === 'server') {
        // The `@server` region is TS: strip the types so the bundler parses it, exactly as
        // the host plugin does for the dev and prerender paths.
        const stripped = await transformWithOxc(emitServerModule(readFileSync(path, 'utf8')), `${path}.ts`, {
          lang: 'ts',
        });
        /* v8 ignore next -- Oxc always returns a map for a `.ts` input; the guard is for the type, not for a case. */
        return stripped.map ? { code: stripped.code, map: stripped.map } : { code: stripped.code };
      }
      const result = transformFud(path, io);
      /* v8 ignore next -- `transformFud` returns null only for a non-`.fud` id, and that was checked above. */
      return result === null ? null : { code: result.code, map: JSON.stringify(result.map) };
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
): Promise<EdgeResult> {
  const routes = builds.filter((rb) => rb.decision.mode !== 'excluded');
  if (routes.length === 0) {
    return EMPTY;
  }

  const input: Record<string, string> = {};
  for (const rb of routes) {
    input[safeName(rb.route.pattern)] = EDGE_PREFIX + rb.route.pattern;
  }

  const output = (await build({
    configFile: false,
    root,
    base,
    logLevel: 'error',
    plugins: [edgePlugin(routes, io)],
    // Forwarded verbatim, for the same reason as the Service Worker's build: this one runs
    // with `configFile: false`, so a project that resolves `@fudic/*` through aliases —
    // every project the CLI scaffolds — would not resolve them here.
    ...(alias === undefined ? {} : { resolve: { alias: alias as never } }),
    build: {
      write: false,
      emptyOutDir: false,
      minify: false,
      sourcemap: nested.sourcemap !== false,
      rollupOptions: {
        input,
        // `render`, `data` and `paths` are reached through the manifest and by the
        // prerender, never through a static import the bundler can see.
        preserveEntrySignatures: 'strict',
        output: {
          format: 'es',
          entryFileNames: '[name].js',
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
