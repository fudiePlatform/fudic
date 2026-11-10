/**
 * One route rendered for one URL (SDD-20 §4.11, SDD-70 §4.3): the context its module is called
 * with, its stream opened up to the end of its `<head>`, and its data endpoint.
 *
 * The module comes from whoever serves: the dev server's graph, the chunks of the build, a
 * bundle an adapter made of them. Nothing here knows which.
 */

import type { RenderContext } from '@fudic/transport';

/** A route's render module: the render, and `data` when the page has `load`. */
export interface RenderModule {
  readonly render: (ctx: RenderContext) => ReadableStream<Uint8Array>;
  /** The data endpoint: its frames, once `load` and `layout` have resolved (SDD-70 §3.7). */
  readonly data?: (ctx: Omit<RenderContext, 'nonce'>) => Promise<ReadableStream<Uint8Array>>;
}

/** Where `load` and `layout` write their status and headers (SDD-69 §3.3). */
export type PendingResponse = NonNullable<RenderContext['response']>;

/** Path segments of a URL path, query stripped and empty segments dropped. */
function segmentsOf(path: string): string[] {
  const pathname = path.split('?', 1)[0]!;
  return pathname.split('/').filter((s) => s.length > 0);
}

/** Whether `pattern` (`/blog/:slug`) matches the concrete `pathname`. */
export function matchesPattern(pattern: string, pathname: string): boolean {
  const segments = segmentsOf(pattern);
  const parts = segmentsOf(pathname);
  return segments.length === parts.length && segments.every((seg, i) => seg.startsWith(':') || seg === parts[i]);
}

/** The params a concrete path fills in a pattern. */
export function paramsOf(pattern: string, pathname: string): Record<string, string> {
  const segments = segmentsOf(pattern);
  const parts = segmentsOf(pathname);
  const params: Record<string, string> = {};
  for (const [i, seg] of segments.entries()) {
    const part = parts[i];
    if (seg.startsWith(':') && part !== undefined) params[seg.slice(1)] = decodeURIComponent(part);
  }
  return params;
}

/** The edge render context for one concrete URL. */
export function edgeContext(pattern: string, url: string, nonce: string, origin: RenderContext['origin'] = 'edge'): RenderContext {
  return { origin, url: new URL(url, 'http://localhost'), params: paramsOf(pattern, url), mode: 'sw', nonce };
}

/**
 * The render context with the request being served, which `load` reads its headers and cookies
 * from (SDD-56 §4.6), and the response it writes its status and headers to (SDD-69 §3.3). The
 * prerender has no request, and passes none (§4.14).
 */
export function withRequest(ctx: RenderContext, request: Request | undefined, response?: PendingResponse): RenderContext {
  const served = response === undefined ? ctx : { ...ctx, response };
  if (request === undefined) return served;
  // The URL on the request's own origin: what a page writes as an absolute URL of itself
  // (SDD-58 §4.7) is where it was asked — the public one behind a trusted proxy (SDD-81 §3.12).
  const url = new URL(`${ctx.url.pathname}${ctx.url.search}`, new URL(request.url).origin);
  const out: RenderContext & { readonly request: Request } = { ...served, url, request };
  return out;
}

/** Drain a web `ReadableStream<Uint8Array>` into a UTF-8 string. */
export async function drainStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
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

/** A route's page for one URL, opened (SDD-70 §4.3). */
export async function renderPage(
  mod: RenderModule,
  pattern: string,
  pathname: string,
  nonce: string,
  request: Request | undefined,
  response: PendingResponse,
  onError?: (error: unknown) => void,
): Promise<OpenedPage> {
  const ctx = withRequest(edgeContext(pattern, pathname, nonce), request, response);
  return openStream(mod.render(onError === undefined ? ctx : { ...ctx, onError }));
}

/** A route's `@server load` for one URL — the data endpoint (§4.5); `null` when it has none. */
export async function pageData(
  mod: RenderModule,
  pattern: string,
  pathname: string,
  request: Request | undefined,
  response: PendingResponse,
): Promise<ReadableStream<Uint8Array> | null> {
  // A route that resolves nothing has no endpoint (SDD-70 §3.7): nobody asks it for frames.
  if (typeof mod.data !== 'function') return null;
  const { nonce: _nonce, ...ctx } = withRequest(edgeContext(pattern, pathname, ''), request, response);
  return mod.data(ctx);
}
