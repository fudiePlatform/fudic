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

import {
  drainStream,
  edgeContext,
  emitRenderChunk,
  type RenderChunkOptions,
  type RenderModule,
} from '@fudic/vite';
import { cached } from './cache.js';

/** What the wrapper needs to know about the page, besides where it is. */
export type PageFacts = Omit<RenderChunkOptions, 'pageModule' | 'withLoad'>;

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
  const wrapper = cached('wrapper', 'js', emitRenderChunk({ ...facts, pageModule: file, withLoad: true }));
  const mod = (await import(/* @vite-ignore */ wrapper)) as RenderModule;
  // `data` undefined is what the wrapper reads as «call `load`»: no branch here.
  return drainStream(mod.render({ ...edgeContext(pattern, url, ''), data }));
}
