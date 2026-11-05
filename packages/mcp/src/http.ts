/**
 * The HTTP entry, for a chat: MCP's Streamable HTTP on 127.0.0.1, under `/mcp/<secret>` and
 * nowhere else. One transport and one server per session, so what a session remembers — the
 * guide topics it has read — is its own.
 */

import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { DevServer } from './dev-server.js';
import { destinationOf, hasCookie, isSecure, previewPath, setCookie, withoutCookie } from './gate.js';

export interface HttpOptions {
  readonly port: number;
  readonly secret: string;
  /** A fresh server for a new session. */
  readonly create: () => McpServer;
  /** The app, behind the preview's door: everything that is not the MCP. */
  readonly app?: DevServer;
}

export interface HttpEntry {
  /** `http://127.0.0.1:<port>/mcp/<secret>`. */
  readonly url: string;
  close(): Promise<void>;
}

const SESSION_HEADER = 'mcp-session-id';

export function startHttp(options: HttpOptions): Promise<HttpEntry> {
  const path = `/mcp/${options.secret}`;
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const { app, secret } = options;
  const opener = previewPath(secret);

  /** Everything that is not the MCP: the door that gives the cookie, and the app behind it. */
  const door = async (req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> => {
    if (app === undefined) {
      res.writeHead(404).end();
      return;
    }
    if (url.pathname === opener) {
      res.writeHead(302, { 'set-cookie': setCookie(secret, isSecure(req)), location: destinationOf(url.searchParams.get('to')) }).end();
      return;
    }
    if (!hasCookie(req, secret)) {
      res.writeHead(404).end();
      return;
    }
    // A door opened before this MCP started: the app starts when it is first asked for.
    if ((await app.ready()) !== 'ready') {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' }).end(`The preview did not start: ${app.failure}`);
      return;
    }
    withoutCookie(req);
    app.handle(req, res);
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== path) {
      await door(req, res, url);
      return;
    }
    const header = req.headers[SESSION_HEADER];
    const id = Array.isArray(header) ? header[0] : header;
    const known = id === undefined ? undefined : sessions.get(id);
    if (known !== undefined) {
      await known.handleRequest(req, res);
      return;
    }
    if (id !== undefined || req.method !== 'POST') {
      // A session this server does not have (it was restarted): the client starts a new one.
      res.writeHead(404, { 'content-type': 'application/json' }).end(
        JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null }),
      );
      return;
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      onsessioninitialized: (sid) => {
        sessions.set(sid, transport);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId !== undefined) sessions.delete(transport.sessionId);
    };
    const server = options.create();
    await server.connect(transport);
    await transport.handleRequest(req, res);
    // Not an initialize request: the transport refused it, and no session was made.
    if (transport.sessionId === undefined) await server.close();
  };

  const http = createHttpServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (!res.headersSent) res.writeHead(500).end(String(error));
    });
  });

  // The app's HMR: through the same door, and only once the app is up.
  http.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (app === undefined || app.state !== 'ready' || !hasCookie(req, secret)) {
      socket.destroy();
      return;
    }
    withoutCookie(req);
    app.upgrade(req, socket, head);
  });

  return new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(options.port, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${options.port}${path}`,
        close: async () => {
          await Promise.all([...sessions.values()].map((t) => t.close()));
          await new Promise<void>((done) => http.close(() => done()));
        },
      });
    });
  });
}
