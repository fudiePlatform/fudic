/**
 * The project's dev server, inside the MCP (SDD-78 §4.3): Vite's `createServer` with the project's
 * `vite.config` and its `fudic()`, in process — never the binary —, started the first time it is
 * asked for and alive as long as the MCP is. Over stdio it listens on its own port; over HTTP it
 * is middleware of the MCP's server, behind its door, with its HMR on the same port.
 *
 * What the app's code throws while it runs reaches Vite's overlay; it is kept here too, to be
 * answered once by the next `fudic_preview`.
 */

import { existsSync } from 'node:fs';
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { InlineConfig, ViteDevServer } from 'vite';
import { exportedFile, packageDir, type Importer } from './fudic.js';
import { isLibrary } from './phases.js';
import { projectsOf } from './project.js';

/** Where a stdio preview listens first; the next free port when it is taken. */
export const PREVIEW_PORT = 4318;

/** How long the first call waits for the server to be ready. */
export const START_WAIT_MS = 30_000;

export type DevState = 'idle' | 'starting' | 'ready' | 'failed';

/** What the app threw while the preview ran, with its stack already mapped to the source. */
export interface DevError {
  readonly message: string;
  readonly stack: string;
}

export type DevMode = { readonly kind: 'listen'; readonly port: number } | { readonly kind: 'middleware' };

type Vite = typeof import('vite');

const CONFIGS = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs'];

/** The project the preview serves: in a workspace, its first app. */
export function appOf(root: string): string {
  const projects = projectsOf(root);
  return projects.find((folder) => !isLibrary(folder)) ?? projects[0]!;
}

/** What the project lacks to be served, as the reason of a `FUD1207`; undefined when it has it all. */
export function missingOf(app: string): string | undefined {
  if (!CONFIGS.some((name) => existsSync(join(app, name)))) return `the project has no vite.config.ts with fudic() in its plugins`;
  if (packageDir('@fudic/vite', app) === undefined) return '@fudic/vite is not installed in the project: pnpm add -D @fudic/vite vite';
  if (packageDir('vite', app) === undefined) return 'vite is not installed in the project: pnpm add -D vite';
  return undefined;
}

export class DevServer {
  readonly #root: string;
  readonly #mode: DevMode;
  readonly #load: Importer;
  /** Over HTTP: the server Vite's HMR listens on for upgrades, which the door hands it. */
  readonly #hmr: Server = createHttpServer();
  #vite: ViteDevServer | undefined;
  #starting: Promise<void> | undefined;
  #state: DevState = 'idle';
  #failure = '';
  #errors: DevError[] = [];

  constructor(root: string, mode: DevMode, load: Importer = (url) => import(url)) {
    this.#root = root;
    this.#mode = mode;
    this.#load = load;
  }

  get state(): DevState {
    return this.#state;
  }

  /** What Vite said when it did not start. */
  get failure(): string {
    return this.#failure;
  }

  /** The folder it serves. */
  get app(): string {
    return appOf(this.#root);
  }

  /** `http://127.0.0.1:<port>`: where it listens over stdio, once ready. */
  get local(): string | undefined {
    const address = this.#vite?.httpServer?.address();
    return address === null || address === undefined || typeof address === 'string' ? undefined : `http://127.0.0.1:${address.port}`;
  }

  /** Starts it, once; after a failure, again. Never rejects: a failure is its state. */
  start(): Promise<void> {
    if (this.#state === 'failed' || this.#starting === undefined) {
      this.#state = 'starting';
      this.#starting = this.#open().then(
        () => {
          this.#state = 'ready';
        },
        (error: unknown) => {
          this.#state = 'failed';
          this.#failure = error instanceof Error ? error.message : String(error);
        },
      );
    }
    return this.#starting;
  }

  /** The state once it is ready or failed, or after `ms`, whichever is first. */
  async ready(ms = START_WAIT_MS): Promise<DevState> {
    let timer: NodeJS.Timeout | undefined;
    const late = new Promise<void>((done) => {
      timer = setTimeout(done, ms);
    });
    await Promise.race([this.start(), late]);
    clearTimeout(timer);
    return this.#state;
  }

  async #open(): Promise<void> {
    const app = this.app;
    const vite = (await this.#load(pathToFileURL(exportedFile(packageDir('vite', app)!, '.')!).href)) as Vite;
    const server: InlineConfig['server'] =
      this.#mode.kind === 'listen'
        ? { host: '127.0.0.1', port: this.#mode.port, strictPort: false }
        : { middlewareMode: true, hmr: { server: this.#hmr } };
    const dev = await vite.createServer({ root: app, logLevel: 'error', server, clearScreen: false });
    this.#keepErrors(dev);
    if (this.#mode.kind === 'listen') await dev.listen();
    this.#vite = dev;
  }

  /** Every error the plugin sends to the overlay, kept as well. */
  #keepErrors(dev: ViteDevServer): void {
    const send = dev.ws.send.bind(dev.ws) as (...args: unknown[]) => void;
    (dev.ws as { send: (...args: unknown[]) => void }).send = (...args: unknown[]) => {
      const payload = args[0] as { type?: unknown; err?: DevError };
      // Only what was thrown: the live type check reports through the overlay too, with no stack,
      // and its diagnostics are fudic_check's to answer.
      if (payload.type === 'error' && payload.err !== undefined && /\n\s+at /u.test(payload.err.stack)) {
        this.#errors.push({ message: payload.err.message, stack: payload.err.stack });
      }
      send(...args);
    };
  }

  /** What the app threw since the last time it was asked, once. */
  takeErrors(): readonly DevError[] {
    const errors = this.#errors;
    this.#errors = [];
    return errors;
  }

  /** A request to the app, over HTTP: to Vite's middlewares, which answer it or say 404. */
  handle(req: IncomingMessage, res: ServerResponse): void {
    this.#vite!.middlewares(req, res, () => {
      res.writeHead(404).end();
    });
  }

  /** A WebSocket of the app, over HTTP: Vite's HMR. */
  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.#hmr.emit('upgrade', req, socket, head);
  }

  async close(): Promise<void> {
    await this.#starting;
    await this.#vite?.close();
  }
}
