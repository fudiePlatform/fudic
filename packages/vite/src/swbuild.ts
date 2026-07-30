/**
 * The Service Worker's OWN build (BUG-03 §4.1).
 *
 * A realm with its own loader gets its own bundle. The SW used to be a chunk of the same
 * Rollup output as `fudic-main`, so code splitting gave the two of them a shared chunk
 * under `/assets/`: one URL, two loaders that know nothing about each other. The page
 * got it from the SW's cache through the fetch handler; the worker's own script loader
 * fetched it from the network — a Service Worker's script graph does not pass through
 * that worker's `fetch` handler, and with `updateViaCache: 'none'` not through the HTTP
 * cache either. A permanent duplicate download, one per worker start.
 *
 * So this runs a nested `build()` with `write: false`, exactly as the link pass does and
 * for exactly the same reason: its output is consumed by another loader. Single input,
 * single output file, no code splitting — `@fudic/ssr` and `@fudic/transport` end up
 * INSIDE the worker, which was always the declared intent (the linker hands `@fudic/ssr`
 * to chunks as a builtin so it is not downloaded once per chunk).
 */

import { build, type Plugin } from 'vite';
import { emitSwBootstrap, type SwBootstrapOptions } from './bootstrap.js';
import { SW_ID, DEV_SW_URL } from './constants.js';
import { serializeMap, type NestedOutputOptions } from './nested.js';

export interface SwBuildResult {
  /** Always `fudic-sw.js`: a Service Worker only controls its own directory and below. */
  readonly fileName: string;
  /** Its code, with `BUILD_TOKEN` still in place — the caller substitutes (§4.3). */
  readonly code: string;
  /** Its Source Map v3, when the host asked for one. Omitted otherwise (BUG-05 §3.2). */
  readonly map?: string;
}

/**
 * Structural view of a bundler output — same reason as in the link pass: the exact type
 * name moves between Vite's Rollup and Rolldown surfaces.
 */
export interface OutputChunkLike {
  readonly type: string;
  readonly fileName: string;
  readonly code?: string;
  readonly map?: unknown;
}
interface BundleOutputLike {
  readonly output: readonly OutputChunkLike[];
}

/**
 * The plugin of the nested build. Deliberately NOT `fudic()` itself: re-entering the
 * whole plugin would mean guarding every hook against recursion. This one only knows how
 * to serve the Service Worker bootstrap.
 */
export function swPlugin(options: SwBootstrapOptions): Plugin {
  return {
    name: 'fudic:sw',
    resolveId(id) {
      return id === SW_ID ? id : null;
    },
    load(id) {
      return id === SW_ID ? emitSwBootstrap(options) : null;
    },
  };
}

/**
 * Bundle the Service Worker into a single self-contained file.
 *
 * `alias` is the host build's `resolve.alias`, forwarded verbatim: the nested build runs
 * with `configFile: false` (no recursion), so without it a project that resolves
 * `@fudic/*` through aliases rather than `node_modules` would not resolve them here.
 */
export async function buildServiceWorker(
  root: string,
  base: string,
  options: SwBootstrapOptions,
  alias: unknown,
  nested: NestedOutputOptions,
): Promise<SwBuildResult> {
  const output = (await build({
    configFile: false,
    root,
    base,
    logLevel: 'error',
    plugins: [swPlugin(options)],
    ...(alias === undefined ? {} : { resolve: { alias: alias as never } }),
    build: {
      write: false,
      emptyOutDir: false,
      minify: false,
      // Always the plain map when the host wants any: the caller composes `'inline'` and
      // `'hidden'` from it (§4.3), so there is one code path here instead of three.
      sourcemap: nested.sourcemap !== false,
      rollupOptions: {
        input: { 'fudic-sw': SW_ID },
        output: {
          format: 'es',
          // One realm, one FILE. Without this the worker is split again and we are back
          // to a script graph the fetch handler never sees. This is the option formerly
          // spelled `inlineDynamicImports: true`, which Rolldown deprecated: it keeps that
          // name as a getter for `!codeSplitting`, so the meaning is unchanged.
          codeSplitting: false,
          entryFileNames: DEV_SW_URL,
        },
      },
    },
  })) as unknown as BundleOutputLike;

  return { fileName: DEV_SW_URL, ...swChunkOf(output.output) };
}

/**
 * The code and map of the ONE chunk a single-input, no-splitting build produces.
 *
 * Extracted so the "there is no such chunk" case is a tested branch rather than an
 * unreachable `??` nobody can provoke: the caller pins `entryFileNames`, so an output
 * without it would mean the bundler changed its contract, and returning empty is what
 * turns that into a visible empty worker instead of a crash mid-build.
 */
export function swChunkOf(
  output: readonly OutputChunkLike[],
): { readonly code: string; readonly map?: string } {
  const entry = output.find((item) => item.type === 'chunk' && item.fileName === DEV_SW_URL);
  const map = serializeMap(entry?.map);
  // The field is omitted, not set to `undefined`: `exactOptionalPropertyTypes`.
  return map === undefined ? { code: entry?.code ?? '' } : { code: entry?.code ?? '', map };
}
