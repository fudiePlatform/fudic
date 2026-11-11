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
 *
 * A criterion without network (§4.7) runs on the app BUILT, as `vite preview` serves it: in dev
 * every route is rendered by the server and the Service Worker keeps none, so offline nothing
 * would open. The build is the bench's own — made with the bench installed, it answers the
 * criteria with their fixtures as dev does — and it lives in the bench's folder. It is made the
 * first time such a criterion asks for it, and again after any file of the app changes.
 */

import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createBench, installBench, WRAPPER_PREFIX, type Bench } from '@fudic/vite';
import { build, createServer, preview, type Plugin, type ViteDevServer } from 'vite';
import { criterionPath, criterionResponse } from './bench-server.js';

/** The app built and served as `vite preview` serves it: where offline criteria run. */
export interface Preview {
  /** `http://127.0.0.1:<port>`. */
  readonly origin: string;
  close(): Promise<void>;
}

export interface App {
  readonly vite: ViteDevServer;
  /** `http://127.0.0.1:<port>`: where its pages are opened. */
  readonly origin: string;
  readonly bench: Bench;
  /** This run's id: a criterion's cookie is `<run>-<n>.<slug>`. */
  readonly run: string;
  /**
   * The app built, for the criteria without network: built on the first call, and again on the
   * first call after a file of the app changed. A build that fails rejects, until a change.
   */
  offline(): Promise<Preview>;
  /** The real `paths()` of the route with this pattern: what it lists, or null without one. */
  paths(pattern: string): Promise<readonly unknown[] | null>;
  close(): Promise<void>;
}

/** What starts the app's Vite: Vite's own `createServer`, injected so the failure path can be checked. */
export type ViteStarter = (root: string) => Promise<ViteDevServer>;

/** What builds the app into `outDir` and serves it, with the bench's endpoint in `extra`. */
export type PreviewStarter = (root: string, outDir: string, extra: Plugin) => Promise<Preview>;

/** The user's Vite, in middleware mode, without HMR: a reload would land in the middle of a criterion. */
export const startUserVite: ViteStarter = (root) =>
  createServer({ root, appType: 'custom', logLevel: 'warn', server: { middlewareMode: true, hmr: false, ws: false } });

/** The user's build, into the bench's folder, served by `vite preview` on a port of its own. */
export const startUserPreview: PreviewStarter = async (root, outDir, extra) => {
  await build({ root, logLevel: 'warn', build: { outDir, emptyOutDir: true } });
  const server = await preview({
    root,
    logLevel: 'warn',
    build: { outDir },
    preview: { port: 0, host: '127.0.0.1', strictPort: false, open: false },
    plugins: [extra],
  });
  const { port } = server.httpServer.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, close: () => server.close() };
};

/** A change under these is the bench's own or a build's, never the app's. */
const NOT_THE_APP = /[\\/](?:node_modules|\.fudic|dist)[\\/]/u;

/** `GET /__bench/criterion/<id>` on any server: the bench's answer, or the next middleware. */
function criterionMiddleware(bench: Bench) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const id = criterionPath((req.url as string).split('?')[0]!);
    if (id === undefined) next();
    else criterionResponse(bench, id, res);
  };
}

export interface AppStarters {
  readonly vite?: ViteStarter;
  readonly preview?: PreviewStarter;
}

/**
 * The app's Vite, started with the bench installed. `outDir` is where the build for the offline
 * criteria goes: inside the bench's folder.
 */
export async function startApp(root: string, outDir: string, starters: AppStarters = {}): Promise<App> {
  const bench = createBench();
  const uninstall = installBench(bench);
  let vite: ViteDevServer;
  try {
    vite = await (starters.vite ?? startUserVite)(root);
  } catch (error) {
    uninstall();
    throw error;
  }
  const answer = criterionMiddleware(bench);
  const http: Server = createHttpServer((req, res) => {
    answer(req, res, () => vite.middlewares(req, res, () => res.writeHead(404, { 'content-type': 'text/plain' }).end('not found')));
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const { port } = http.address() as AddressInfo;

  // Any change of the app makes the next offline criterion build it again.
  let changed = false;
  vite.watcher.on('all', (_event: string, path: string) => {
    if (!NOT_THE_APP.test(path)) changed = true;
  });
  const endpoint: Plugin = {
    name: 'fudic-workbench:criterion',
    configurePreviewServer(server) {
      server.middlewares.use(answer);
    },
  };
  let previewed: Promise<Preview> | undefined;
  const closePreview = async (): Promise<void> => {
    await previewed?.then((p) => p.close(), () => undefined);
  };

  return {
    vite,
    origin: `http://127.0.0.1:${port}`,
    bench,
    run: Math.random().toString(36).slice(2, 10),
    offline() {
      if (previewed !== undefined && !changed) return previewed;
      changed = false;
      const before = closePreview();
      previewed = before.then(() => (starters.preview ?? startUserPreview)(root, outDir, endpoint));
      return previewed;
    },
    async paths(pattern) {
      const module = (await vite.ssrLoadModule(WRAPPER_PREFIX + pattern)) as { paths?: () => Promise<readonly unknown[]> };
      return typeof module.paths === 'function' ? module.paths() : null;
    },
    async close() {
      await closePreview();
      await vite.close();
      await new Promise<void>((resolve) => {
        http.close(() => resolve());
        http.closeAllConnections();
      });
      uninstall();
    },
  };
}
