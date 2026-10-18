/**
 * `fudic dev` and `fudic preview` at the root of a workspace (BUG-50 §4.5, §6.9): every app on
 * one port, each under its base URL.
 *
 * Each app runs its OWN Vite — its config, its plugin, its version — on a free port nobody types,
 * started with the `vite` it has installed: `<app>/node_modules/vite`, with this Node and no shell,
 * so stopping it stops it on every platform. `preview` serves each app's `dist`, so it needs a
 * build first, which is the app's `build`. In front of them, `createProxy`.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer as createNetServer, type AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import type { Server } from 'node:http';
import { createProxy } from './proxy.js';
import type { ServedApp } from '../workspace/bases.js';

export type ServeKind = 'dev' | 'preview';

/** The port the user opens: Vite's own, for `dev` and for `preview`. */
export const FRONT_PORT: Readonly<Record<ServeKind, number>> = { dev: 5173, preview: 4173 };

/** A running app server. */
export interface AppProcess {
  stop(): void;
}

/** What serving needs of the machine; the CLI gives the real one, a test a fake. */
export interface ServeDeps {
  /** A port nothing listens on. */
  freePort(): Promise<number>;
  /** Start `app`'s Vite (`dev`) or its `vite preview`, on `port`. */
  start(app: ServedApp, kind: ServeKind, port: number): AppProcess;
  /** Resolves once something answers on `port`; rejects when nothing does in time. */
  ready(port: number, base: string): Promise<void>;
  /** Listen on `port` with the proxy; resolves with the server once it listens. */
  listen(server: Server, port: number): Promise<Server>;
  /** Resolves when the user stops it: Ctrl-C. */
  stopped(): Promise<void>;
  out(text: string): void;
}

/** The lines §6.9 prints once every app answers. */
export function serveBanner(kind: ServeKind, apps: readonly ServedApp[], port: number): string {
  const width = Math.max(8, ...apps.map((app) => app.name.length + 3));
  const ordered = [...apps].sort((a, b) => a.base.length - b.base.length || a.name.localeCompare(b.name));
  const count = apps.length === 1 ? '1 app' : `${apps.length} apps`;
  return [
    `fudic ${kind} — ${count} on one port`,
    '',
    ...ordered.map((app) => `  ${app.name.padEnd(width)}http://localhost:${port}${app.base}`),
    '',
  ].join('\n');
}

/** Serve every app until stopped; the exit code. */
export async function serveWorkspace(kind: ServeKind, apps: readonly ServedApp[], port: number, deps: ServeDeps): Promise<number> {
  const running: AppProcess[] = [];
  try {
    const backends = [];
    for (const app of apps) {
      const internal = await deps.freePort();
      running.push(deps.start(app, kind, internal));
      backends.push({ base: app.base, port: internal });
    }
    await Promise.all(backends.map((backend) => deps.ready(backend.port, backend.base)));
    const server = await deps.listen(createProxy(backends), port);
    deps.out(serveBanner(kind, apps, port));
    await deps.stopped();
    server.close();
    return 0;
  } finally {
    for (const app of running) app.stop();
  }
}

/** The real machine. */
export function nodeServeDeps(): ServeDeps {
  return {
    freePort: () =>
      new Promise((resolve, reject) => {
        const probe = createNetServer();
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
          // A TCP listen is always given an address with its port.
          const { port } = probe.address() as AddressInfo;
          probe.close(() => resolve(port));
        });
      }),
    start: (app, kind, port) => {
      const vite = join(dirname(createRequire(join(app.path, 'package.json')).resolve('vite/package.json')), 'bin', 'vite.js');
      const args = [vite, ...(kind === 'preview' ? ['preview'] : []), '--port', String(port), '--strictPort', '--host', '127.0.0.1'];
      // Vite's own banner and its request log are noise next to ours; its errors are not.
      const child = spawn(process.execPath, args, { cwd: app.path, stdio: ['ignore', 'ignore', 'inherit'] });
      return { stop: () => child.kill() };
    },
    ready: async (port, base) => {
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        try {
          await fetch(`http://127.0.0.1:${port}${base}`);
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
      throw new Error(`nothing answered on port ${port} within 60 s`);
    },
    listen: (server, port) =>
      new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, () => resolve(server));
      }),
    // Ctrl-C, or whoever started it asking it to stop: either way the apps stop with it.
    stopped: () =>
      new Promise((resolve) => {
        process.once('SIGINT', () => resolve());
        process.once('SIGTERM', () => resolve());
      }),
    out: (text) => process.stdout.write(text),
  };
}
