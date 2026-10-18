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
import { createInterface } from 'node:readline';
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

/** Which stream a line of an app's server came on. */
export type AppStream = 'out' | 'err';

/** What serving needs of the machine; the CLI gives the real one, a test a fake. */
export interface ServeDeps {
  /** A port nothing listens on. */
  freePort(): Promise<number>;
  /**
   * Start `app`'s Vite (`dev`) or its `vite preview`, on `port`. Every line it writes is handed
   * to `line`, whole and without its newline.
   */
  start(app: ServedApp, kind: ServeKind, port: number, line: (text: string, stream: AppStream) => void): AppProcess;
  /** Resolves once something answers on `port`; rejects when nothing does in time. */
  ready(port: number, base: string): Promise<void>;
  /** Listen on `port` with the proxy; resolves with the server once it listens. */
  listen(server: Server, port: number): Promise<Server>;
  /** Resolves when the user stops it: Ctrl-C. */
  stopped(): Promise<void>;
  out(text: string): void;
  err(text: string): void;
  /** Milliseconds, for the times the output says. */
  now(): number;
}

/** The width of the name column: every line of an app starts with its name, aligned. */
function nameWidth(apps: readonly ServedApp[]): number {
  return Math.max(8, ...apps.map((app) => app.name.length + 3));
}

/** A duration the way the terminal says it: `850 ms`, `2.1 s`. */
export function duration(ms: number): string {
  return ms < 1000 ? `${String(Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** The first line, said before anything starts: what is about to be served. */
export function serveHeading(kind: ServeKind, apps: readonly ServedApp[]): string {
  const count = apps.length === 1 ? '1 app' : `${apps.length} apps`;
  return `fudic ${kind} — ${count} on one port\n\n`;
}

/** The lines §6.9 prints once every app answers, with how long it took and how to change it. */
export function serveBanner(kind: ServeKind, apps: readonly ServedApp[], port: number, ms: number): string {
  const width = nameWidth(apps);
  const ordered = [...apps].sort((a, b) => a.base.length - b.base.length || a.name.localeCompare(b.name));
  return [
    '',
    ...ordered.map((app) => `  ${app.name.padEnd(width)}http://localhost:${port}${app.base}`),
    '',
    `  ready in ${duration(ms)} · Ctrl+C stops it · fudic ${kind} --port <n> serves on another port`,
    '',
  ].join('\n');
}

/**
 * What Vite writes that says nothing here: its banner, which names the INTERNAL port nobody
 * should open, and its key hints, which no one can type into a server the CLI started.
 */
const VITE_NOISE = /^\s*$|VITE v\d|➜|press h|ready in \d|use --host to expose|Network: /u;

/** Strip the colours of a line, to read it — never to print it. */
const plain = (text: string): string => text.replace(/\u001b\[[0-9;]*m/gu, '');

/** Serve every app until stopped; the exit code. */
export async function serveWorkspace(kind: ServeKind, apps: readonly ServedApp[], port: number, deps: ServeDeps): Promise<number> {
  const running: AppProcess[] = [];
  const width = nameWidth(apps);
  const started = deps.now();
  try {
    deps.out(serveHeading(kind, apps));
    const backends = [];
    for (const app of apps) {
      const internal = await deps.freePort();
      const prefix = `  ${app.name.padEnd(width)}`;
      running.push(
        deps.start(app, kind, internal, (text, stream) => {
          if (VITE_NOISE.test(plain(text))) return;
          (stream === 'err' ? deps.err : deps.out)(`${prefix}${text}\n`);
        }),
      );
      deps.out(`${prefix}starting\n`);
      backends.push({ app, prefix, base: app.base, port: internal });
    }
    await Promise.all(
      backends.map(async (backend) => {
        await deps.ready(backend.port, backend.base);
        deps.out(`${backend.prefix}started in ${duration(deps.now() - started)}\n`);
      }),
    );
    const server = await deps.listen(createProxy(backends), port);
    deps.out(serveBanner(kind, apps, port, deps.now() - started));
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
    start: (app, kind, port, line) => {
      const vite = join(dirname(createRequire(join(app.path, 'package.json')).resolve('vite/package.json')), 'bin', 'vite.js');
      const args = [vite, ...(kind === 'preview' ? ['preview'] : []), '--port', String(port), '--strictPort', '--host', '127.0.0.1'];
      // Piped, so every line can say which app it is; in colour when the terminal has colour and
      // the user did not turn it off — `NO_COLOR` is theirs, and Node warns when both are set.
      const colour = process.stdout.isTTY && process.env['NO_COLOR'] === undefined;
      const env = colour ? { ...process.env, FORCE_COLOR: '1' } : process.env;
      const child = spawn(process.execPath, args, { cwd: app.path, stdio: ['ignore', 'pipe', 'pipe'], env });
      createInterface({ input: child.stdout }).on('line', (text) => line(text, 'out'));
      createInterface({ input: child.stderr }).on('line', (text) => line(text, 'err'));
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
    err: (text) => process.stderr.write(text),
    now: () => Date.now(),
  };
}
