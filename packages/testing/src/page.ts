/**
 * A page painted to HTML through vitest's module graph, as `vite dev` paints a route (§4.2,
 * §4.9): the plugin's own wrapper (`emitRenderChunk`), rendered with the context `vite dev`
 * builds and drained to a string.
 *
 * Shared by `mount`, which paints a host page, and `visit`, which paints a route. The wrapper
 * is written to the cache and imported like any module, so the page, its components and
 * whatever `@server` they import live in the same graph as the test — and a `vi.mock` of the
 * test reaches them.
 */

import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  drainStream,
  edgeContext,
  emitRenderChunk,
  nodeIo,
  routeUsesDi,
  type RenderChunkOptions,
  type RenderModule,
  type RouteBuild,
} from '@fudic/vite/harness';
import { cached } from './cache.js';

/** What the wrapper needs to know about the page, besides where it is. */
export type PageFacts = Omit<RenderChunkOptions, 'pageModule' | 'withLoad'>;

/** This harness's `providers.ts`, which the wrapper imports to put the overrides in its root. */
const PROVIDERS = fileURLToPath(new URL(`./providers${extname(fileURLToPath(import.meta.url))}`, import.meta.url))
  .replace(/\\/gu, '/');

/**
 * The plugin's wrapper, with the request's container handed through the test's overrides
 * first (§4.6): the one thing of it the harness changes. Its root is otherwise the one
 * `vite dev` opens.
 */
function wrapperOf(file: string, facts: PageFacts): string {
  const source = emitRenderChunk({ ...facts, pageModule: file, withLoad: true });
  return `import { overridden as $overridden } from ${JSON.stringify(PROVIDERS)};\n${source.replaceAll('iocRoot()', '$overridden(iocRoot())')}`;
}

/** The wrapper of the page at `file`, imported through vitest's graph. */
export async function loadWrapper(file: string, facts: PageFacts): Promise<RenderModule> {
  const wrapper = cached('wrapper', 'js', wrapperOf(file, facts));
  return (await import(/* @vite-ignore */ wrapper)) as RenderModule;
}

/** What the plugin tells the wrapper of a discovered route, as `vite dev` writes it. */
export function routeFacts(rb: RouteBuild, httpFile: string | undefined): PageFacts {
  return {
    hasLoad: rb.analysis.hasLoad,
    hasPaths: rb.analysis.hasPaths,
    hasLayout: rb.analysis.hasLayout,
    hasDi: routeUsesDi(rb.absPath, nodeIo()),
    hasHttp: rb.analysis.hasHttp === true,
    fluentLoad: rb.analysis.fluentLoad === true,
    ...(httpFile === undefined ? {} : { globalChain: httpFile }),
  };
}

/**
 * The HTML `vite dev` would answer for `url` with the page at `file`, matched by `pattern`.
 * With `data`, the page is handed it in place of what `load` would resolve.
 */
export async function renderPage(
  file: string,
  facts: PageFacts,
  pattern: string,
  url: string,
  data?: unknown,
): Promise<string> {
  const mod = await loadWrapper(file, facts);
  // `data` undefined is what the wrapper reads as «call `load`»: no branch here.
  return drainStream(mod.render({ ...edgeContext(pattern, url, ''), data }));
}
