/**
 * Where the app is seen from (SDD-78 §4.3): its dev server, the URLs a person opens it at, and
 * where a call to one of its functions is sent. Over stdio, the dev server's own port. Over HTTP,
 * the MCP's port and tunnel, through the door: the URL that opens it, and the cookie a call
 * carries to get past it — which the door takes off before the app sees the request.
 */

import { DevServer, PREVIEW_PORT } from './dev-server.js';
import { cookieValue, PREVIEW_COOKIE, previewPath } from './gate.js';

export interface Site {
  readonly dev: DevServer;
  /** The URLs that open the app at `to`: the local one, and the public one when the tunnel is up. */
  urls(to: string): { readonly local: string; readonly public?: string };
  /** Where a call is sent, once the dev server is ready. */
  callTarget(): { readonly origin: string; readonly headers?: Readonly<Record<string, string>> };
}

/** Over stdio: the dev server listens on its own port, with no door. */
export function stdioSite(root: string, port = PREVIEW_PORT): Site {
  const dev = new DevServer(root, { kind: 'listen', port });
  return {
    dev,
    urls: (to) => ({ local: `${dev.local!}${to}` }),
    callTarget: () => ({ origin: dev.local! }),
  };
}

/** Over HTTP: the dev server is middleware of the MCP's server, behind its door. */
export class HttpSite implements Site {
  readonly dev: DevServer;
  readonly #secret: string;
  readonly #port: number;
  /** The tunnel's origin, once it is up. */
  public publicOrigin: string | undefined;

  constructor(root: string, secret: string, port: number) {
    this.dev = new DevServer(root, { kind: 'middleware' });
    this.#secret = secret;
    this.#port = port;
  }

  urls(to: string): { readonly local: string; readonly public?: string } {
    const path = `${previewPath(this.#secret)}?to=${encodeURIComponent(to).replace(/%2F/gu, '/')}`;
    return { local: `http://127.0.0.1:${this.#port}${path}`, ...(this.publicOrigin !== undefined ? { public: `${this.publicOrigin}${path}` } : {}) };
  }

  callTarget(): { readonly origin: string; readonly headers: Readonly<Record<string, string>> } {
    return { origin: `http://127.0.0.1:${this.#port}`, headers: { cookie: `${PREVIEW_COOKIE}=${cookieValue(this.#secret)}` } };
  }
}
