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

import { resolveDocument, type ResolveIo } from '@fudic/compiler';
import { type RenderContext } from '@fudic/transport';
import { type RouteBuild } from './discover.js';

/**
 * Every `.fud` a route's page is made of: the route, its layout, every component either of
 * them reaches, and every snippet file (SDD-35 §4.5). The dev server refuses to render the page
 * while one of them has an error — the graph the build compiles, read by the same resolver.
 */
export function documentFiles(entry: string, io: ResolveIo): readonly string[] {
  const graph = resolveDocument(entry, io).value;
  return [
    graph.entryPath,
    ...graph.layouts.map((layout) => layout.path),
    ...[...graph.components.values()].map((component) => component.path),
    ...graph.snippetFiles,
  ];
}

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

/**
 * A page whose first bytes have arrived (SDD-70 §4.3): what decides its status — `load`,
 * `layout` — has run, and the rest is still on its way.
 */
export interface OpenedPage {
  /** The page up to the end of its `</head>`; the whole page when it showed none. */
  readonly head: string;
  /** Whether `head` is the whole page. */
  readonly whole: boolean;
  /** The rest of the page, as it comes. */
  readonly rest: AsyncIterable<Uint8Array>;
  /** Stop rendering: the browser went away, and `ctx.signal` tells `load` (§7). */
  cancel(): void;
}

const HEAD_END = new TextEncoder().encode('</head>');

/** Where `</head>` ends in `bytes`, or -1. A byte search: the cut never splits a character. */
function headEnd(bytes: Uint8Array): number {
  outer: for (let i = 0; i + HEAD_END.length <= bytes.length; i++) {
    for (let j = 0; j < HEAD_END.length; j++) if (bytes[i + j] !== HEAD_END[j]) continue outer;
    return i + HEAD_END.length;
  }
  return -1;
}

/**
 * Read a page's stream up to the end of its `<head>` and hand the rest over as it comes. An
 * error before that — `load` threw — rejects, and the response can still be its error page.
 */
export async function openStream(stream: ReadableStream<Uint8Array>): Promise<OpenedPage> {
  const reader = stream.getReader();
  let read = new Uint8Array(0);
  const cancel = (): void => {
    void reader.cancel();
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return { head: new TextDecoder().decode(read), whole: true, rest: (async function* () {})(), cancel };
    const grown = new Uint8Array(read.length + value.length);
    grown.set(read);
    grown.set(value, read.length);
    read = grown;
    const end = headEnd(read);
    if (end < 0) continue;
    const tail = read.subarray(end);
    return {
      head: new TextDecoder().decode(read.subarray(0, end)),
      whole: false,
      rest: (async function* () {
        if (tail.length > 0) yield tail;
        for (;;) {
          const next = await reader.read();
          if (next.done) return;
          yield next.value;
        }
      })(),
      cancel,
    };
  }
}

/** The context of one concrete URL's render, with its request and, in dev, the overlay. */
function renderContext(
  pattern: string,
  url: string,
  nonce: string,
  request?: Request,
  response?: PendingResponse,
  onError?: (error: unknown) => void,
): RenderContext {
  const ctx = withRequest(edgeContext(pattern, url, nonce), request, response);
  return onError === undefined ? ctx : { ...ctx, onError };
}

/** Load a route's wrapper module and render one concrete URL to an HTML string. */
export async function renderRouteHtml(
  load: ModuleLoader,
  wrapperId: string,
  pattern: string,
  url: string,
  nonce: string,
  request?: Request,
  response?: PendingResponse,
  onError?: (error: unknown) => void,
): Promise<string> {
  const mod = await load(wrapperId);
  return drainStream(mod.render(renderContext(pattern, url, nonce, request, response, onError)));
}

/** As `renderRouteHtml`, but the page goes out as it is rendered (SDD-70 §4.3). */
export async function renderRouteStream(
  load: ModuleLoader,
  wrapperId: string,
  pattern: string,
  url: string,
  nonce: string,
  request?: Request,
  response?: PendingResponse,
  onError?: (error: unknown) => void,
): Promise<OpenedPage> {
  const mod = await load(wrapperId);
  return openStream(mod.render(renderContext(pattern, url, nonce, request, response, onError)));
}

/** Run a route's `@server load(ctx)` for one concrete URL — the data endpoint (§4.5). */
export async function loadRouteData(
  load: ModuleLoader,
  wrapperId: string,
  pattern: string,
  url: string,
  request?: Request,
  response?: PendingResponse,
): Promise<unknown> {
  const mod = await load(wrapperId);
  if (typeof mod.data !== 'function') {
    return {};
  }
  const { nonce: _nonce, ...ctx } = withRequest(edgeContext(pattern, url, ''), request, response);
  return mod.data(ctx);
}

/** Where `load` and `layout` write their status and headers (SDD-69 §3.3). */
export type PendingResponse = NonNullable<RenderContext['response']>;

/** A fresh one, for one render or one data request. */
export const pendingResponse = (): PendingResponse => ({ status: 200, headers: new Headers() });

/**
 * Whether `load` or `layout` read the session on `response` (SDD-69 §4.4). By shape: the note
 * is `@fudic/http`'s, written by the copy inside the route chunk under a registered symbol.
 */
export function readsSession(response: PendingResponse): boolean {
  return (response as { readonly [key: symbol]: unknown })[Symbol.for('fudic.sessionRead')] === true;
}

/**
 * The render context with the request being served, which `load` reads its headers and
 * cookies from (SDD-56 §4.6), and the response it writes its status and headers to (SDD-69
 * §3.3). The prerender has no request, and passes none (§4.14).
 */
export function withRequest(ctx: RenderContext, request: Request | undefined, response?: PendingResponse): RenderContext {
  const served = response === undefined ? ctx : { ...ctx, response };
  if (request === undefined) return served;
  // The URL on the request's own origin: what a page writes as an absolute URL of itself
  // (SDD-58 §4.7) is where it was asked, `http://localhost:5173` in dev.
  const url = new URL(`${ctx.url.pathname}${ctx.url.search}`, new URL(request.url).origin);
  const out: RenderContext & { readonly request: Request } = { ...served, url, request };
  return out;
}
