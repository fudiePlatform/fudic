/**
 * The workbench's one server: one port, one origin, every component the process has open.
 * `/__bench/<tag>/` is a component's shell, `/__bench/<tag>/ws` its WebSocket,
 * `/__bench/<tag>/shot/<id>/<n>-<kind>.png` the shots of its last run, and everything else is
 * Vite's — its pages, its modules and its HMR socket, on this same server.
 *
 * A shell that connects late (the browser button) gets its component's last `session`, its last
 * `state` and the last `result` of each criterion: it sees what the open one sees. What a shell
 * sends is a command for its own component, whatever tag it names.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import {
  parseCommand,
  type BenchMessage,
  type ResultMessage,
  type RunCommand,
  type RunningMessage,
  type SessionMessage,
  type StateMessage,
} from './protocol.js';
import { shellPage } from './shell.js';
import { closeFrame, FrameReader, handshake, pongFrame, textFrame, UNSUPPORTED } from './ws.js';

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

/** Where a backend that is not fudic's asks what a criterion runs with (SDD-82 §3.8). */
const CRITERION_PREFIX = `${BENCH_PREFIX}criterion/`;

/** The criterion `/__bench/criterion/<id>` asks about; undefined for any other path. */
export function criterionPath(path: string): string | undefined {
  return path.startsWith(CRITERION_PREFIX) && path.length > CRITERION_PREFIX.length
    ? decodeURIComponent(path.slice(CRITERION_PREFIX.length))
    : undefined;
}

/** What the bench reads a criterion's names from. */
export interface CriterionNamesOf {
  names(criterion: string): { readonly services?: string; readonly answers?: readonly string[]; readonly clock?: string } | undefined;
}

/**
 * `{ services, answers, clock }` of a running criterion — the names of its fixture lines, which a
 * backend in another language seeds itself with — or a 404 for one that is not running.
 */
export function criterionResponse(bench: CriterionNamesOf, id: string, res: ServerResponse): void {
  const names = bench.names(id);
  if (names === undefined) {
    res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: `no criterion "${id}" is running` }));
    return;
  }
  const body = { services: names.services ?? null, answers: names.answers ?? [], clock: names.clock ?? null };
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body));
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
  /** Keeps a shot, dropping the previous one of that criterion and kind, and answers its URL. */
  putShot(tag: string, id: string, kind: 'before' | 'after', png: Buffer): string;
  /** Answers `/__bench/criterion/<id>` from the app's bench (SDD-82 §3.8). Before it, a 404. */
  serveCriteria(bench: CriterionNamesOf): void;
  /** Who obeys what the shells send. Before it, they are ignored. */
  onCommand(handler: (command: RunCommand) => void): void;
  /** Forgets a component: its kept messages and shots, and its shells are disconnected. */
  forget(tag: string): void;
  close(): Promise<void>;
}

/** What is kept of one component, for a shell that connects late. */
interface Kept {
  session?: SessionMessage;
  state?: StateMessage;
  /** The last run: what it ran and why. */
  running?: RunningMessage;
  readonly results: Map<string, ResultMessage>;
  readonly clients: Set<Socket>;
  /** `<id>/<n>-<kind>.png` → its PNG: only the last of each criterion and kind. */
  readonly shots: Map<string, Buffer>;
}

/** A tag or a slug, as it goes into a path. */
const segment = (text: string) => encodeURIComponent(text);

/** `/__bench/<tag>/<rest>` → its tag and the rest; undefined for any other path. */
function benchPath(path: string): { tag: string; rest: string } | undefined {
  if (!path.startsWith(BENCH_PREFIX)) return undefined;
  const cut = path.indexOf('/', BENCH_PREFIX.length);
  if (cut < 0) return undefined;
  return { tag: path.slice(BENCH_PREFIX.length, cut), rest: path.slice(cut + 1) };
}

export async function startBenchServer(input: BenchServerInput): Promise<BenchServer> {
  let vite: Middleware | undefined;
  let obey: ((command: RunCommand) => void) | undefined;
  let criteria: CriterionNamesOf | undefined;
  let shotCount = 0;
  const components = new Map<string, Kept>();
  const kept = (tag: string): Kept => {
    let entry = components.get(tag);
    if (entry === undefined) {
      entry = { results: new Map(), clients: new Set(), shots: new Map() };
      components.set(tag, entry);
    }
    return entry;
  };

  const notFound = (res: ServerResponse) => res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');

  const http = createServer((req, res) => {
    const path = (req.url as string).split('?')[0]!;
    const criterion = criterionPath(path);
    if (criterion !== undefined && criteria !== undefined) {
      criterionResponse(criteria, criterion, res);
      return;
    }
    const bench = benchPath(path);
    if (bench?.rest === '') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(shellPage());
      return;
    }
    if (bench !== undefined && bench.rest.startsWith('shot/')) {
      const png = components.get(bench.tag)?.shots.get(bench.rest.slice('shot/'.length));
      if (png === undefined) notFound(res);
      else res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' }).end(png);
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
    const entry = kept(bench.tag);
    entry.clients.add(socket);
    // An abrupt disconnect is an error and then a close; either one drops the shell.
    const drop = () => entry.clients.delete(socket);
    socket.on('close', drop).on('error', drop);
    const reader = new FrameReader();
    socket.on('data', (chunk: Buffer) => {
      for (const frame of reader.push(chunk)) {
        if (frame.type === 'text') {
          const command = parseCommand(frame.text);
          // Only what a shell may ask, and always of its own component.
          if (command !== undefined && command.type !== 'open' && command.type !== 'close') {
            obey?.({ ...command, tag: bench.tag });
          }
        } else if (frame.type === 'ping') {
          socket.write(pongFrame(frame.payload));
        } else {
          // 1005 means the client sent no code, and is never sent back (RFC 6455 §7.4.1).
          socket.end(closeFrame(frame.type === 'close' ? (frame.code === 1005 ? 1000 : frame.code) : UNSUPPORTED));
        }
      }
    });
    if (entry.session !== undefined) send(socket, entry.session);
    if (entry.state !== undefined) send(socket, entry.state);
    // The last run before the results: the results of it that arrived settle their cards.
    if (entry.running !== undefined) send(socket, entry.running);
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
        delete entry.running;
      } else if (message.type === 'result') {
        entry.results.set(message.id, message);
      } else if (message.type === 'state') {
        entry.state = message;
      } else if (message.type === 'running') {
        entry.running = message;
      }
      for (const socket of entry.clients) send(socket, message);
    },
    putShot(tag, id, kind, png) {
      const shots = kept(tag).shots;
      const prefix = `${segment(id)}/`;
      for (const key of shots.keys()) if (key.startsWith(prefix) && key.endsWith(`-${kind}.png`)) shots.delete(key);
      const name = `${prefix}${++shotCount}-${kind}.png`;
      shots.set(name, png);
      return `${shellPath(segment(tag))}shot/${name}`;
    },
    serveCriteria(bench) {
      criteria = bench;
    },
    onCommand(handler) {
      obey = handler;
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
