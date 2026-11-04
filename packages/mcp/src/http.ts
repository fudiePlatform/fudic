/**
 * The HTTP entry, for a chat: MCP's Streamable HTTP on 127.0.0.1, under `/mcp/<secret>` and
 * nowhere else. One transport and one server per session, so what a session remembers — the
 * guide topics it has read — is its own.
 */

import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export interface HttpOptions {
  readonly port: number;
  readonly secret: string;
  /** A fresh server for a new session. */
  readonly create: () => McpServer;
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

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (pathname !== path) {
      res.writeHead(404).end();
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
