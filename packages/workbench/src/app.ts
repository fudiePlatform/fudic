/**
 * The app's own Vite (SDD-82 §3.8): what pages and flows run on. Unlike the components' Vite, it
 * loads the user's `vite.config` — their `fudic()`, their `routesDir`, their plugins — and serves
 * the app as `vite dev` serves it, with its Service Worker (the plugin serves it in preview mode
 * once the bench is installed). It listens on its own port, so the app's URLs and the components'
 * generated pages never meet, and the Service Worker's scope is the whole app.
 *
 * The bench's hooks are installed before it starts: each request that carries a criterion's
 * cookie is answered by the criterion's fixture where it says so. `GET /__bench/criterion/<id>`
 * tells a backend that is not fudic's which case a criterion is (§3.8).
 */

import { createServer as createHttpServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createBench, installBench, type Bench } from '@fudic/vite';
import { createServer, type ViteDevServer } from 'vite';
import { criterionPath, criterionResponse } from './bench-server.js';

export interface App {
  readonly vite: ViteDevServer;
  /** `http://127.0.0.1:<port>`: where its pages are opened. */
  readonly origin: string;
  readonly bench: Bench;
  /** This run's id: a criterion's cookie is `<run>.<criterion>`. */
  readonly run: string;
  close(): Promise<void>;
}

/** What starts the app's Vite: Vite's own `createServer`, injected so the failure path can be checked. */
export type ViteStarter = (root: string) => Promise<ViteDevServer>;

/** The user's Vite, in middleware mode, without HMR: a reload would land in the middle of a criterion. */
export const startUserVite: ViteStarter = (root) =>
  createServer({ root, appType: 'custom', logLevel: 'warn', server: { middlewareMode: true, hmr: false, ws: false } });

export async function startApp(root: string, start: ViteStarter = startUserVite): Promise<App> {
  const bench = createBench();
  const uninstall = installBench(bench);
  let vite: ViteDevServer;
  try {
    vite = await start(root);
  } catch (error) {
    uninstall();
    throw error;
  }
  const http: Server = createHttpServer((req, res) => {
    const id = criterionPath((req.url as string).split('?')[0]!);
    if (id !== undefined) {
      criterionResponse(bench, id, res);
      return;
    }
    vite.middlewares(req, res, () => res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'));
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const { port } = http.address() as AddressInfo;
  return {
    vite,
    origin: `http://127.0.0.1:${port}`,
    bench,
    run: Math.random().toString(36).slice(2, 10),
    async close() {
      await vite.close();
      await new Promise<void>((resolve) => {
        http.close(() => resolve());
        http.closeAllConnections();
      });
      uninstall();
    },
  };
}
