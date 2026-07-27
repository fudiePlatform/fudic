/**
 * On-demand HTML rendering for the dev server (SDD-19 §4.10: "los `.html` de modo 1 se
 * renderizan on-demand [en dev] para no prerenderizar en cada guardado").
 *
 * In build, a mode-1 route resolves to a real `.html` written by `generateBundle`, and a
 * mode-2 route is served by the Service Worker out of the Web Worker. In dev neither
 * exists on the first navigation — the SW is not registered yet and nothing is
 * prerendered — so the dev server renders the route itself by running the SAME wrapper
 * module (`RenderChunk`) the WW would, through Vite's SSR module graph. Once the page
 * has registered the SW, navigations go the three-thread way and this path is the
 * fallback (and the only path for a browser without Service Workers).
 *
 * Pure and Vite-free: the module loader is INJECTED, so the matcher and the drain are
 * testable without a dev server.
 */

import { type RouteBuild } from './discover.js';

/** The wrapper module of a route: the render fn the Web Worker also calls. */
export interface RenderModule {
  readonly default: (route: string) => ReadableStream<Uint8Array>;
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
 * descending specificity (SDD-19 §4.1), so the FIRST hit wins — the same first-hit rule
 * the runtime manifest matcher uses, kept identical on purpose.
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
  route: string,
): Promise<string> {
  const mod = await load(wrapperId);
  return drainStream(mod.default(route));
}
