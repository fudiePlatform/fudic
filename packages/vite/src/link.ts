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

import { build, type Plugin } from 'vite';
import { type ResolveIo } from '@fudic/compiler';
import { type RouteBuild } from './discover.js';
import { emitRenderChunk } from './wrapper.js';
import { transformFud } from './transform.js';
import { LINK_DIR, LINK_PREFIX } from './constants.js';

export interface LinkChunk {
  readonly fileName: string;
  readonly code: string;
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
  readonly imports?: readonly string[];
  readonly isEntry?: boolean;
  readonly facadeModuleId?: string | null;
}
interface BundleOutputLike {
  readonly output: readonly OutputChunkLike[];
}

/** A filesystem-safe chunk base name from a route pattern. */
export function safeName(pattern: string): string {
  const s = pattern.replace(/[^a-z0-9]+/giu, '-').replace(/^-+|-+$/gu, '');
  return s.length > 0 ? s : 'index';
}

/**
 * The plugin of the nested build. Deliberately NOT `fudic()` itself: re-entering the
 * whole plugin would mean guarding every hook against recursion. This one only knows
 * how to serve the linked wrappers and compile `.fud`.
 */
function linkPlugin(builds: readonly RouteBuild[], io: ResolveIo): Plugin {
  return {
    name: 'fudic:link',
    resolveId(id) {
      return id.startsWith(LINK_PREFIX) ? id : null;
    },
    load(id) {
      if (!id.startsWith(LINK_PREFIX)) {
        return null;
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
        withLoad: false, // server code never ships to the client (§4.5)
      });
    },
    transform(_code, id) {
      const path = id.split('?')[0] ?? id;
      if (!path.endsWith('.fud')) {
        return null;
      }
      const result = transformFud(path, io);
      return result === null ? null : { code: result.code };
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

/** Run the link pass for every `sw` route. Returns nothing when there are none. */
export async function runLinkPass(
  root: string,
  base: string,
  builds: readonly RouteBuild[],
  io: ResolveIo,
): Promise<LinkResult> {
  const swRoutes = builds.filter((rb) => rb.decision.mode === 'sw');
  if (swRoutes.length === 0) {
    return EMPTY;
  }

  const input: Record<string, string> = {};
  for (const rb of swRoutes) {
    input[safeName(rb.route.pattern)] = LINK_PREFIX + rb.route.pattern;
  }

  const output = (await build({
    configFile: false,
    root,
    base,
    logLevel: 'error',
    plugins: [linkPlugin(swRoutes, io)],
    build: {
      write: false,
      emptyOutDir: false,
      minify: false,
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
    chunks.push({ fileName: item.fileName, code: item.code ?? '' });
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
  for (const rb of swRoutes) {
    const fileName = byModuleId.get(LINK_PREFIX + rb.route.pattern);
    if (fileName === undefined) {
      continue;
    }
    entries.set(rb.route.pattern, fileName);
    deps.set(rb.route.pattern, topologicalDeps(fileName, importsOf));
  }

  return { chunks, entries, deps };
}
