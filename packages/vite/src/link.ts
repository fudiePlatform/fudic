/**
 * The LINK PASS (SDD-20 §4.3): a second Rollup output whose chunks the Service Worker
 * can link by hand, because it may not `import()`.
 *
 * Same sources, different format: `format: 'cjs'` with named exports gives exactly the
 * `exports`/`require` shape the linker's `new Function` evaluates, and `@fudic/ssr`
 * stays external — it is bundled INTO the Service Worker and handed to chunks as a
 * builtin, so it is never downloaded twice.
 *
 * It runs with `write: false` inside `generateBundle`, so the resulting chunks are
 * emitted as assets of the main build: one write phase, and their final hashed names
 * are known in time for the manifest.
 */

import { build, transformWithOxc, type Plugin } from 'vite';
import { type ResolveIo } from '@fudic/compiler';
import { safeName } from '@fudic/transport';
import { type RouteBuild } from './discover.js';
import { isLinkable } from './mode.js';
import { emitRenderChunk } from './wrapper.js';
import { runtimeUrls } from './constants.js';
import { routeNameLookup, routeUsesDi } from './client.js';
import { transformFud } from './transform.js';
import { LINK_DIR, LINK_PREFIX } from './constants.js';
import { loadWithSourceMap } from './inputmaps.js';
import { serializeMap, type NestedOutputOptions } from './nested.js';

export interface LinkChunk {
  readonly fileName: string;
  readonly code: string;
  /** Its Source Map v3, when the host asked for one. Omitted otherwise (BUG-05 §3.2). */
  readonly map?: string;
}

export interface LinkResult {
  /** Every emitted chunk, in no particular order. */
  readonly chunks: readonly LinkChunk[];
  /** Route pattern → its entry chunk file name. */
  readonly entries: ReadonlyMap<string, string>;
  /** Route pattern → its dependencies, TOPOLOGICALLY ordered (deps first). */
  readonly deps: ReadonlyMap<string, readonly string[]>;
}

const EMPTY: LinkResult = { chunks: [], entries: new Map(), deps: new Map() };

/**
 * Structural view of a bundler output. Declared here rather than imported because the
 * exact type name moves between Vite's Rollup and Rolldown surfaces; what this pass
 * needs from a chunk has been stable for a decade.
 */
interface OutputChunkLike {
  readonly type: string;
  readonly fileName: string;
  readonly code?: string;
  readonly map?: unknown;
  readonly imports?: readonly string[];
  readonly isEntry?: boolean;
  readonly facadeModuleId?: string | null;
}
interface BundleOutputLike {
  readonly output: readonly OutputChunkLike[];
}

/**
 * A filesystem-safe chunk base name from a route pattern — re-exported, never redefined.
 *
 * It lived here as a second copy of the one in `@fudic/transport`, byte for byte. The
 * comment beside that one says why there must not be two: the build names the chunk with it
 * and the runtime derives the name back, so a drift between the copies is a set of files
 * nobody asks for, with no test failing.
 */
export { safeName } from '@fudic/transport';

/**
 * The plugin of the nested build. Deliberately NOT `fudic()` itself: re-entering the
 * whole plugin would mean guarding every hook against recursion. This one only knows
 * how to serve the linked wrappers and compile `.fud`.
 */
function linkPlugin(builds: readonly RouteBuild[], io: ResolveIo, base: string): Plugin {
  // The Service Worker renders the same pages the edge does, so it publishes the same route
  // names (SDD-39 §4.7): one map, resolved once for the pass.
  const routeNameOf = routeNameLookup(builds, io);
  return {
    name: 'fudic:link',
    resolveId(id) {
      return id.startsWith(LINK_PREFIX) ? id : null;
    },
    load(id) {
      if (!id.startsWith(LINK_PREFIX)) {
        // A workspace package arrives as its built `dist/*.js`; its own map is the link back
        // to the `.ts`, and nothing else in this nested build goes looking for it.
        return loadWithSourceMap(id);
      }
      const pattern = id.slice(LINK_PREFIX.length);
      const rb = builds.find((b) => b.route.pattern === pattern);
      if (rb === undefined) {
        return null;
      }
      return emitRenderChunk({
        pageModule: rb.absPath.replace(/\\/gu, '/'),
        hasLoad: rb.analysis.hasLoad,
        hasPaths: rb.analysis.hasPaths,
        // Not passed on purpose: with `withLoad: false` it would change nothing, and the
        // omission is the statement — the SW imports neither `load` nor `layout` (§4.5).
        hasDi: routeUsesDi(rb.absPath, io),
        withLoad: false, // server code never ships to the client (§4.5)
        runtime: runtimeUrls(base),
      });
    },
    async transform(_code, id) {
      const path = id.split('?')[0] ?? id;
      if (!path.endsWith('.fud')) {
        return null;
      }
      const result = transformFud(path, io, routeNameOf(path));
      if (result === null) return null;
      // Since SDD-34 the neutral zone of `@code` reaches this module verbatim, so it is
      // TypeScript whenever the author wrote it — same strip as the host plugin does.
      // The map goes back too (BUG-05 §4.2). Dropping it was not a missing feature but a
      // silent one: the nested build would chain its own map onto the GENERATED module and
      // produce a map that is valid, resolves, and never mentions the `.fud`.
      //
      // It goes in as `inMap` rather than alongside the result: Oxc composes `.fud` → TS with
      // its own TS → JS and returns one map for the code it actually emitted. Returning the
      // emit's map next to the STRIPPED code described a text that no longer existed — these
      // are the chunks the Service Worker links, and they came out with a handful of
      // mappings each, or none at all.
      const emitted = await transformWithOxc(
        result.code,
        `${path}.ts`,
        { lang: 'ts', sourcemap: true },
        result.map,
      );
      return emitted.map ? { code: emitted.code, map: emitted.map } : { code: emitted.code };
    },
  };
}

/** Depth-first post-order over the chunk graph: a chunk's imports come before it. */
function topologicalDeps(
  entry: string,
  importsOf: ReadonlyMap<string, readonly string[]>,
): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>([entry]);
  const visit = (fileName: string): void => {
    for (const imported of importsOf.get(fileName) ?? []) {
      if (seen.has(imported)) {
        continue;
      }
      seen.add(imported);
      visit(imported);
      ordered.push(imported);
    }
  };
  visit(entry);
  return ordered;
}

/**
 * Run the link pass for every LINKABLE route (`isLinkable`, not `mode === 'sw'`).
 * Returns nothing when there are none.
 *
 * A prerendered route needs a chunk too: once the Service Worker is in control it
 * renders every navigation, and without a chunk it had to fall back to downloading the
 * HTML file, which is BUG-02. The cost is bytes in `sw/c/` at build time; nothing extra
 * is downloaded, because `warm` still only brings the template being visited (§4.7).
 */
export async function runLinkPass(
  root: string,
  base: string,
  builds: readonly RouteBuild[],
  io: ResolveIo,
  nested: NestedOutputOptions,
): Promise<LinkResult> {
  const linkable = builds.filter((rb) => isLinkable(rb.decision));
  if (linkable.length === 0) {
    return EMPTY;
  }

  const input: Record<string, string> = {};
  for (const rb of linkable) {
    input[safeName(rb.route.pattern)] = LINK_PREFIX + rb.route.pattern;
  }

  const output = (await build({
    configFile: false,
    root,
    base,
    logLevel: 'error',
    plugins: [linkPlugin(linkable, io, base)],
    build: {
      write: false,
      emptyOutDir: false,
      // As in the SW build: the host's (BUG-06 §4.1). Safe for a chunk the linker
      // evaluates by hand, because a minifier renames LOCALS: the names it must not
      // touch are properties of `exports`, and `preserveEntrySignatures: 'strict'` below
      // is what keeps the entry's own exports from being tree-shaken away.
      minify: nested.minify,
      // As in the SW build: the plain map, and the caller composes the host's mode (§4.3).
      sourcemap: nested.sourcemap !== false,
      rollupOptions: {
        input,
        // The linker calls `render` through the manifest, not through a static import
        // the bundler can see: without this the entry's exports are tree-shaken away.
        preserveEntrySignatures: 'strict',
        // Bundled into the Service Worker and injected as a linker builtin.
        external: ['@fudic/ssr'],
        output: {
          format: 'cjs',
          exports: 'named',
          entryFileNames: `${LINK_DIR}/[name]-[hash].js`,
          chunkFileNames: `${LINK_DIR}/[name]-[hash].js`,
        },
      },
    },
  })) as unknown as BundleOutputLike;

  const chunks: LinkChunk[] = [];
  const importsOf = new Map<string, readonly string[]>();
  const byModuleId = new Map<string, string>();

  for (const item of output.output) {
    if (item.type !== 'chunk') {
      continue;
    }
    const map = serializeMap(item.map);
    chunks.push(
      map === undefined
        ? { fileName: item.fileName, code: item.code ?? '' }
        : { fileName: item.fileName, code: item.code ?? '', map },
    );
    importsOf.set(
      item.fileName,
      (item.imports ?? []).filter((i: string) => !i.startsWith('@fudic/')),
    );
    if (item.isEntry === true && item.facadeModuleId != null) {
      byModuleId.set(item.facadeModuleId, item.fileName);
    }
  }

  const entries = new Map<string, string>();
  const deps = new Map<string, readonly string[]>();
  for (const rb of linkable) {
    const fileName = byModuleId.get(LINK_PREFIX + rb.route.pattern);
    if (fileName === undefined) {
      continue;
    }
    entries.set(rb.route.pattern, fileName);
    deps.set(rb.route.pattern, topologicalDeps(fileName, importsOf));
  }

  return { chunks, entries, deps };
}
