/**
 * The Service Worker router (SDD-16 §4.5): the ONE decision branch in the whole
 * system — cache hit or miss. The browser governs navigation (`FetchEvent`);
 * there is no main-thread router, no click interception, no manual pushState.
 */

import { type RenderMessage, type RenderRequest } from './messages.js';
import { receiveRender } from './adapter.js';
import { type RouteManifest } from './manifest.js';

/**
 * Structural view of the ServiceWorker `FetchEvent` (lib.dom carries no SW
 * types, and lib.webworker cannot be mixed with DOM in one compilation).
 */
export interface FetchEvent {
  readonly request: Request;
  respondWith(response: Response | PromiseLike<Response>): void;
}

export interface Router {
  /** Handle a navigation `FetchEvent`: calls `event.respondWith(...)`. Cache-first, then delegate. */
  handle(event: FetchEvent): void;
}

export interface RouterConfig {
  manifest: RouteManifest;
  worker: Worker; // the render Web Worker
  cache: Cache;   // target of `caches.open(...)`
}

const HTML_HEADERS = { 'content-type': 'text/html; charset=utf-8' };

let reqSeq = 0;

export function createRouter(config: RouterConfig): Router {
  return {
    handle(event: FetchEvent): void {
      if (event.request.mode !== 'navigate') {
        return; // not a navigation: other handlers own it
      }
      const url = new URL(event.request.url);
      const route = url.pathname + url.search;
      const entry = config.manifest.match(route);
      if (entry === null || !entry.dynamic) {
        return; // static: outside the dynamic render shell
      }
      event.respondWith(respond(config, event.request, route));
    },
  };
}

async function respond(config: RouterConfig, request: Request, route: string): Promise<Response> {
  const cached = await config.cache.match(request);
  if (cached !== undefined) {
    return cached; // the hit side of the only branch
  }

  reqSeq += 1;
  const req: RenderRequest = { type: 'render', reqId: `req-${reqSeq}`, route };
  const { port1, port2 } = new MessageChannel();
  config.worker.postMessage(req, [port2]);

  const first = await nextMessage(port1);
  const stream = receiveRender(port1, first);
  const [toResponse, toCache] = stream.tee();
  // The cache leg drains its branch fully; once it settles, the render is over
  // and the per-request channel closes — no residue.
  void config.cache
    .put(request, new Response(toCache, { headers: HTML_HEADERS }))
    .catch(() => undefined)
    .finally(() => {
      port1.close();
    });
  return new Response(toResponse, { headers: HTML_HEADERS });
}

function nextMessage(port: MessagePort): Promise<RenderMessage> {
  return new Promise((resolve) => {
    port.onmessage = (e: MessageEvent): void => {
      port.onmessage = null;
      resolve(e.data as RenderMessage);
    };
  });
}
