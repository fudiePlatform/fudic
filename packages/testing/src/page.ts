/**
 * A page painted to HTML through vitest's module graph, as `vite dev` paints a route (§4.2,
 * §4.9): the plugin's own wrapper (`emitRenderChunk`), rendered with the context `vite dev`
 * builds and drained to a string.
 *
 * Shared by `mount`, which paints a host page, and `visit`, which paints a route. The wrapper
 * is written to the cache and imported like any module, so the page, its components and
 * whatever their handlers import live in the same graph as the test — and a `vi.mock` of the
 * test reaches them.
 */

import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  drainStream,
  edgeContext,
  withRequest,
  emitRenderChunk,
  nodeIo,
  routeApi,
  routeUsesDi,
  SERVER_ROOT_ID,
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
  // `bench`: a visit with a fixture is a criterion of the workbench's bench (SDD-82 §3.10). Without
  // one installed, or for a request without its cookie, the wrapper runs as it always did.
  const source = emitRenderChunk({ ...facts, pageModule: file, withLoad: true, bench: true });
  return `import { overridden as $overridden } from ${JSON.stringify(PROVIDERS)};\n${source.replaceAll('iocRoot()', '$overridden(iocRoot())')}`;
}

/** The wrapper of the page at `file`, imported through vitest's graph. */
export async function loadWrapper(file: string, facts: PageFacts): Promise<RenderModule> {
  const wrapper = cached('wrapper', 'js', wrapperOf(file, facts));
  return (await import(/* @vite-ignore */ wrapper)) as RenderModule;
}

/** What the plugin tells the wrapper of a discovered route, as `vite dev` writes it. */
export function routeFacts(rb: RouteBuild): PageFacts {
  return {
    hasDi: routeUsesDi(rb.absPath, nodeIo()),
    ...routeApi(rb, SERVER_ROOT_ID, true),
  };
}

/**
 * The HTML `vite dev` would answer for `url` with the page at `file`, matched by `pattern`.
 * With `data`, the page is handed it in place of what `load` would resolve; with `layout`, the
 * props of its layout in place of what `layout` would resolve. With `request`, the page is
 * painted for it: what `load` reads of its cookies, and the criterion a fixture began.
 */
export async function renderPage(
  file: string,
  facts: PageFacts,
  pattern: string,
  url: string,
  data?: unknown,
  layout?: unknown,
  request?: Request,
): Promise<string> {
  const mod = await loadWrapper(file, facts);
  // `undefined` is what the wrapper reads as «resolve it», and `withRequest` as «no request»: no branch here.
  return drainStream(mod.render({ ...withRequest(edgeContext(pattern, url, ''), request), data, layout }));
}
