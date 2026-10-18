/**
 * The one port of `fudic dev` and `fudic preview` (BUG-50 §4.5): a reverse proxy in front of one
 * Vite per app, as a gateway or a monolith would put them on one origin.
 *
 * A request goes to the app with the longest base it starts with, `/admin/x` to `admin` before
 * `/` gets it. `/_fudic/…` is the exception: the runtime belongs to the ORIGIN, not to an app
 * (SDD-45 §4.2), so it is asked of each app in turn until one has it. A WebSocket upgrade — Vite's
 * HMR — is piped to its app untouched.
 */

import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { connect } from 'node:net';
import type { Duplex } from 'node:stream';
import { appFor } from '../workspace/bases.js';

/** An app behind the proxy: its base URL, and the port its own server listens on. */
export interface Backend {
  readonly base: string;
  readonly port: number;
}

/** Where the runtime is published, at the root of the origin whatever the app. */
const RUNTIME = '/_fudic/';

const HOST = '127.0.0.1';

export function createProxy(backends: readonly Backend[]): Server {
  const ordered = [...backends].sort((a, b) => b.base.length - a.base.length);
  const server = createServer((req, res) => {
    const path = pathOf(req);
    // `/admin` is the app at `/admin/`: sent there, as Vite does for its own base.
    const bare = ordered.find((backend) => backend.base !== '/' && path === backend.base.slice(0, -1));
    if (bare !== undefined) {
      res.writeHead(301, { location: `${bare.base}${urlOf(req).slice(path.length)}` });
      res.end();
      return;
    }
    const candidates = path.startsWith(RUNTIME) ? ordered : [appFor(ordered, path)].filter((b) => b !== undefined);
    forward(req, res, candidates.map((backend) => backend.port));
  });
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const backend = appFor(ordered, pathOf(req));
    if (backend === undefined) {
      socket.destroy();
      return;
    }
    tunnel(req, socket, head, backend.port);
  });
  return server;
}

/** A request of a server always has its url: `undefined` is only the client side's. */
function urlOf(req: IncomingMessage): string {
  return req.url as string;
}

function pathOf(req: IncomingMessage): string {
  return new URL(urlOf(req), 'http://localhost').pathname;
}

/**
 * Hand the request to the first port, or to the next one when it answers 404 and there is a
 * next one. Only a runtime request has several, and it is a GET: there is no body to replay.
 */
function forward(req: IncomingMessage, res: ServerResponse, ports: readonly number[]): void {
  const [port, ...rest] = ports;
  if (port === undefined) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`404 ${urlOf(req)}: no app is served here`);
    return;
  }
  const upstream = request({ host: HOST, port, path: req.url, method: req.method, headers: req.headers }, (answer) => {
    if (answer.statusCode === 404 && rest.length > 0) {
      answer.resume();
      forward(req, res, rest);
      return;
    }
    res.writeHead(answer.statusCode as number, answer.headers);
    // The app died halfway through the body: the browser gets a broken response, not a hang.
    answer.on('error', () => res.destroy());
    answer.pipe(res);
  });
  upstream.on('error', () => {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('502 the app did not answer');
  });
  if (rest.length > 0) upstream.end();
  else req.pipe(upstream);
}

/** A WebSocket upgrade, written to the app as it came and then piped both ways. */
function tunnel(req: IncomingMessage, socket: Duplex, head: Buffer, port: number): void {
  const upstream = connect(port, HOST, () => {
    const headers: string[] = [];
    for (let i = 0; i < req.rawHeaders.length; i += 2) headers.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${headers.join('\r\n')}\r\n\r\n`);
    upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
}
