/** What the tests share: a project folder of their own, and a client talking to a server. */

import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apply, nodeReadIo, nodeWriteIo, planNew, type NewOptions } from '@fudic/cli';
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
  return {
    root,
    name: 'demo',
    commit: () => commit,
    git: () => {
      throw new Error('no git in a fake project');
    },
  };
}

/**
 * What `fudic new` writes, in a fresh folder, with this package's `node_modules` linked in as
 * the project's own: the `@fudic/*` it would install.
 */
export async function newApp(): Promise<{ readonly root: string; dispose(): void }> {
  const work = mkdtempSync(join(tmpdir(), 'fudic-mcp-app-'));
  const options: NewOptions = {
    cwd: work,
    force: false,
    id: 'demo',
    prefix: 'app',
    pm: 'pnpm',
    install: false,
    git: false,
    sw: true,
    layout: { own: '_layout' },
    target: 'static',
  };
  await apply(await planNew('demo', options, nodeReadIo()), options, nodeWriteIo());
  const root = join(work, 'demo');
  symlinkSync(fileURLToPath(new URL('../node_modules', import.meta.url)), join(root, 'node_modules'), 'junction');
  return { root, dispose: () => rmSync(work, { recursive: true, force: true }) };
}

/** A client connected to `server` through memory, as a chat or an agent would be. */
export async function connect(server: McpServer): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}
