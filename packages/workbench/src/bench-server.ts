/**
 * The workbench's one server: one port, one origin, every component the process has open.
 * `/__bench/<tag>/` is a component's shell, `/__bench/<tag>/ws` its WebSocket, and everything
 * else is Vite's — its pages, its modules and its HMR socket, on this same server.
 *
 * A shell that connects late (the browser button) gets its component's last `session` and the
 * last `result` of each criterion: it sees what the open one sees.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import type { BenchMessage, ResultMessage, SessionMessage } from './protocol.js';
import { shellPage } from './shell.js';
import { handshake, textFrame } from './ws.js';

/** The workbench's own paths; the only ones that are not Vite's. */
export const BENCH_PREFIX = '/__bench/';

/** Where a component's shell lives. */
export function shellPath(tag: string): string {
  return `${BENCH_PREFIX}${tag}/`;
}

/** Where its shell's socket connects. */
export function socketPath(tag: string): string {
  return `${shellPath(tag)}ws`;
}

/** Connect-style middleware: Vite's `middlewares`. */
export type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

export interface BenchServerInput {
  /** 0 for an ephemeral port. */
  readonly port: number;
}

export interface BenchServer {
  /** The `http.Server`, for Vite's HMR. */
  readonly http: Server;
  /** `http://127.0.0.1:<port>`. */
  readonly origin: string;
  /** Hands every other request to Vite. Before it, they are 404. */
  mount(middleware: Middleware): void;
  /**
   * Sends a message to the shells of its component — a `problem` to every shell — and keeps
   * it for those that connect later.
   */
  publish(message: BenchMessage): void;
  /** Forgets a component: its kept messages, and its shells are disconnected. */
  forget(tag: string): void;
  close(): Promise<void>;
}

/** What is kept of one component, for a shell that connects late. */
interface Kept {
  session?: SessionMessage;
  readonly results: Map<string, ResultMessage>;
  readonly clients: Set<Socket>;
}

/** `/__bench/<tag>/<rest>` → its tag and the rest; undefined for any other path. */
function benchPath(path: string): { tag: string; rest: string } | undefined {
  if (!path.startsWith(BENCH_PREFIX)) return undefined;
  const cut = path.indexOf('/', BENCH_PREFIX.length);
  if (cut < 0) return undefined;
  return { tag: path.slice(BENCH_PREFIX.length, cut), rest: path.slice(cut + 1) };
}

export async function startBenchServer(input: BenchServerInput): Promise<BenchServer> {
  let vite: Middleware | undefined;
  const components = new Map<string, Kept>();
  const kept = (tag: string): Kept => {
    let entry = components.get(tag);
    if (entry === undefined) {
      entry = { results: new Map(), clients: new Set() };
      components.set(tag, entry);
    }
    return entry;
  };

  const notFound = (res: ServerResponse) => res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');

  const http = createServer((req, res) => {
    const path = (req.url as string).split('?')[0]!;
    if (benchPath(path)?.rest === '') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(shellPage());
      return;
    }
    if (vite === undefined) {
      notFound(res);
      return;
    }
    vite(req, res, () => notFound(res));
  });

  const send = (socket: Socket, message: BenchMessage) => socket.write(textFrame(JSON.stringify(message)));

  http.on('upgrade', (req: IncomingMessage, socket: Socket) => {
    const bench = benchPath(req.url as string);
    // Any other upgrade is Vite's HMR, which listens on this server too.
    if (bench === undefined || bench.rest !== 'ws') return;
    socket.write(handshake(String(req.headers['sec-websocket-key'])));
    // The shell sends nothing worth reading; reading keeps the socket from backing up.
    socket.resume();
    const entry = kept(bench.tag);
    entry.clients.add(socket);
    // An abrupt disconnect is an error and then a close; either one drops the shell.
    const drop = () => entry.clients.delete(socket);
    socket.on('close', drop).on('error', drop);
    if (entry.session !== undefined) send(socket, entry.session);
    for (const result of entry.results.values()) send(socket, result);
  });

  // A busy port rejects: the binary turns it into its error line, never into a stack.
  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(input.port, '127.0.0.1', resolve);
  });
  const { port } = http.address() as AddressInfo;

  return {
    http,
    origin: `http://127.0.0.1:${port}`,
    mount(middleware) {
      vite = middleware;
    },
    publish(message) {
      if (message.type === 'problem') {
        for (const entry of components.values()) for (const socket of entry.clients) send(socket, message);
        return;
      }
      const entry = kept(message.tag);
      if (message.type === 'session') {
        entry.session = message;
        entry.results.clear();
      } else if (message.type === 'result') {
        entry.results.set(message.id, message);
      }
      for (const socket of entry.clients) send(socket, message);
    },
    forget(tag) {
      const entry = components.get(tag);
      if (entry === undefined) return;
      for (const socket of entry.clients) socket.destroy();
      components.delete(tag);
    },
    close() {
      for (const entry of components.values()) for (const socket of entry.clients) socket.destroy();
      return new Promise((resolve) => {
        http.close(() => resolve());
        http.closeAllConnections();
      });
    },
  };
}
