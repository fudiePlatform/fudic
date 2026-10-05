/**
 * The workbench's one server: one port, one origin. `/__bench/` is the shell, `/__bench/ws` its
 * WebSocket, and everything else is Vite's — its pages, its modules and its HMR socket, on this
 * same server.
 *
 * The socket only speaks server → shell, and a shell that connects late (the browser button)
 * gets the last `session` and the last `result` of each criterion: it sees what the open one sees.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import type { BenchMessage, ResultMessage, SessionMessage } from './protocol.js';
import { shellPage } from './shell.js';
import { handshake, textFrame } from './ws.js';

/** Where the shell lives; the only paths that are not Vite's. */
export const SHELL_PATH = '/__bench/';
export const SOCKET_PATH = '/__bench/ws';

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
  /** Sends a message to every shell, and keeps it for those that connect later. */
  publish(message: BenchMessage): void;
  close(): Promise<void>;
}

export async function startBenchServer(input: BenchServerInput): Promise<BenchServer> {
  let vite: Middleware | undefined;
  const clients = new Set<Socket>();
  let session: SessionMessage | undefined;
  const results = new Map<string, ResultMessage>();

  const notFound = (res: ServerResponse) => res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');

  const http = createServer((req, res) => {
    const path = (req.url as string).split('?')[0];
    if (path === SHELL_PATH) {
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
    // Any other upgrade is Vite's HMR, which listens on this server too.
    if (req.url !== SOCKET_PATH) return;
    socket.write(handshake(String(req.headers['sec-websocket-key'])));
    // The shell sends nothing worth reading; reading keeps the socket from backing up.
    socket.resume();
    clients.add(socket);
    // An abrupt disconnect is an error and then a close; either one drops the shell.
    const drop = () => clients.delete(socket);
    socket.on('close', drop).on('error', drop);
    if (session !== undefined) send(socket, session);
    for (const result of results.values()) send(socket, result);
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
      if (message.type === 'session') {
        session = message;
        results.clear();
      } else if (message.type === 'result') {
        results.set(message.id, message);
      }
      for (const socket of clients) send(socket, message);
    },
    close() {
      for (const socket of clients) socket.destroy();
      return new Promise((resolve) => {
        http.close(() => resolve());
        http.closeAllConnections();
      });
    },
  };
}
