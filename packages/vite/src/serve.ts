/**
 * On-demand HTML rendering for the dev and preview servers (SDD-20 §4.11). They are
 * the *edge* of §9 of the source document: the first visit to any route, the data
 * endpoints, and the CSP header with a per-response nonce.
 *
 * The server runs the SAME wrapper the Service Worker links — one emit target, not
 * two. What differs is the caller: here `load(ctx)` runs in process; in the SW the
 * data arrives from the generated endpoint.
 *
 * Pure and Vite-free: the module loader is INJECTED, so matching, param extraction and
 * the drain are testable without a dev server.
 */

import { type RenderContext } from '@fudic/transport';
import { type RouteBuild } from './discover.js';

/** The route wrapper module: the render fn, and `data` when the page has `load`. */
export interface RenderModule {
  readonly render: (ctx: RenderContext) => ReadableStream<Uint8Array>;
  readonly data?: (ctx: Omit<RenderContext, 'nonce'>) => Promise<unknown>;
}

/** Injected loader: import a module id through the host's SSR module graph. */
export type ModuleLoader = (id: string) => Promise<RenderModule>;

/** Path segments of a URL path, query stripped and empty segments dropped. */
function segmentsOf(path: string): string[] {
  const pathname = path.split('?', 1)[0] ?? path;
  return pathname.split('/').filter((s) => s.length > 0);
}

/**
 * The route whose pattern matches `pathname`, or `null`. `builds` is already ordered by
 * descending specificity, so the FIRST hit wins — the same first-hit rule the runtime
 * manifest matcher uses, kept identical on purpose.
 */
export function matchRouteBuild(
  builds: readonly RouteBuild[],
  pathname: string,
): RouteBuild | null {
  const parts = segmentsOf(pathname);
  for (const rb of builds) {
    if (rb.decision.mode === 'excluded') {
      continue;
    }
    const pattern = segmentsOf(rb.route.pattern);
    if (pattern.length !== parts.length) {
      continue;
    }
    if (pattern.every((seg, i) => seg.startsWith(':') || seg === parts[i])) {
      return rb;
    }
  }
  return null;
}

/** The params a concrete path fills in a pattern. */
export function paramsOf(pattern: string, pathname: string): Record<string, string> {
  const segments = segmentsOf(pattern);
  const parts = segmentsOf(pathname);
  const params: Record<string, string> = {};
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]!;
    const part = parts[i];
    if (seg.startsWith(':') && part !== undefined) {
      params[seg.slice(1)] = decodeURIComponent(part);
    }
  }
  return params;
}

/** The edge render context for one concrete URL. */
export function edgeContext(
  pattern: string,
  url: string,
  nonce: string,
  origin: RenderContext['origin'] = 'edge',
): RenderContext {
  return {
    origin,
    url: new URL(url, 'http://localhost'),
    params: paramsOf(pattern, url),
    mode: 'sw',
    nonce,
  };
}

/** Drain a web `ReadableStream<Uint8Array>` into a UTF-8 string. */
export async function drainStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

/** Load a route's wrapper module and render one concrete URL to an HTML string. */
export async function renderRouteHtml(
  load: ModuleLoader,
  wrapperId: string,
  pattern: string,
  url: string,
  nonce: string,
): Promise<string> {
  const mod = await load(wrapperId);
  return drainStream(mod.render(edgeContext(pattern, url, nonce)));
}

/** Run a route's `@server load(ctx)` for one concrete URL — the data endpoint (§4.5). */
export async function loadRouteData(
  load: ModuleLoader,
  wrapperId: string,
  pattern: string,
  url: string,
): Promise<unknown> {
  const mod = await load(wrapperId);
  if (typeof mod.data !== 'function') {
    return {};
  }
  const { nonce: _nonce, ...ctx } = edgeContext(pattern, url, '');
  return mod.data(ctx);
}
