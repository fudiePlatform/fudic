/** What the tests share: a project folder of their own, and a client talking to a server. */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Project } from '../src/project.js';

/** A fresh folder; `files` are written into it. Removed by the returned `dispose`. */
export function tempDir(files: Readonly<Record<string, string>> = {}): { readonly root: string; dispose(): void } {
  const root = mkdtempSync(join(tmpdir(), 'fudic-mcp-'));
  for (const [path, text] of Object.entries(files)) writeFileSync(join(root, path), text);
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

/** A project that is not on disk, at a fixed commit. */
export function fakeProject(root = '/project', commit = 'b59fa7d'): Project {
  return { root, name: 'demo', commit: () => commit };
}

/** A client connected to `server` through memory, as a chat or an agent would be. */
export async function connect(server: McpServer): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}
