/**
 * What fudic-mcp does (criteria 1–3), with everything that touches the process injected: the
 * terminal, the tunnel and the signal. stdio is a transport in memory; HTTP is real, on 127.0.0.1.
 */

import { createServer as createNetServer } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { FUD1406, format } from '@fudic/diagnostics';
import { USAGE } from '../src/args.js';
import { main, type MainDeps } from '../src/main.js';
import { secretOf } from '../src/secret.js';
import type { TunnelResult } from '../src/tunnel.js';
import { tempDir } from './helpers.js';

const stdio = vi.hoisted(() => ({ clientSide: undefined as unknown }));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', async () => {
  const { InMemoryTransport: Memory } = await import('@modelcontextprotocol/sdk/inMemory.js');
  return {
    StdioServerTransport: class {
      constructor() {
        const [client, server] = Memory.createLinkedPair();
        stdio.clientSide = client;
        return server;
      }
    },
  };
});

interface Harness {
  readonly deps: MainDeps;
  readonly out: string[];
  readonly err: string[];
  stop?: () => void;
}

let dir: ReturnType<typeof tempDir>;
const harnesses: Harness[] = [];

function harness(tunnel: (port: number) => Promise<TunnelResult> = () => Promise.reject(new Error('no tunnel was asked for'))): Harness {
  const h: Harness = {
    out: [],
    err: [],
    deps: {
      cwd: dir.root,
      out: (text) => h.out.push(text),
      err: (text) => h.err.push(text),
      tunnel,
      onStop: (stop) => {
        h.stop = stop;
      },
    },
  };
  harnesses.push(h);
  return h;
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createNetServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

beforeEach(() => {
  dir = tempDir({ 'package.json': '{ "name": "acme" }' });
});

afterEach(() => {
  for (const h of harnesses.splice(0)) h.stop?.();
  dir.dispose();
});

describe('the command line', () => {
  it('--help prints the usage', async () => {
    const h = harness();
    expect(await main(['--help'], h.deps)).toBe(0);
    expect(h.out).toEqual([USAGE]);
  });

  it('a wrong option: the error and the usage, on stderr', async () => {
    const h = harness();
    expect(await main(['--tunnel'], h.deps)).toBe(1);
    expect(h.err).toEqual([`fudic-mcp: --tunnel, --port and --new-secret go with --http\n\n${USAGE}`]);
    expect(h.out).toEqual([]);
  });
});

describe('stdio (criterion 1)', () => {
  it('speaks MCP and prints nothing', async () => {
    const h = harness();
    expect(await main([], h.deps)).toBe(0);
    expect(h.out).toEqual([]);
    expect(h.err).toEqual([]);
    const client = new Client({ name: 'agent', version: '0' });
    await client.connect(stdio.clientSide as InMemoryTransport);
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual(['fudic_guide']);
    await client.close();
  });
});

describe('http (criteria 2 and 3)', () => {
  it('prints the project, the local URL and the warning, and serves there', async () => {
    const port = await freePort();
    const h = harness();
    expect(await main(['--http', '--port', String(port)], h.deps)).toBe(0);
    const secret = secretOf(dir.root);
    const local = `http://127.0.0.1:${port}/mcp/${secret}`;
    expect(h.out).toEqual([
      ['fudic MCP · project acme · http', `  local   ${local}`, 'Anyone with this URL can read and write this project. Stop with Ctrl+C.', ''].join('\n'),
    ]);
    const client = new Client({ name: 'chat', version: '0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(local)));
    expect((await client.listTools()).tools).toHaveLength(1);
    await client.close();
  });

  it('keeps the secret between starts; --new-secret changes it', async () => {
    const first = harness();
    await main(['--http', '--port', String(await freePort())], first.deps);
    const kept = secretOf(dir.root);
    first.stop!();
    const again = harness();
    await main(['--http', '--port', String(await freePort())], again.deps);
    expect(again.out[0]).toContain(`/mcp/${kept}`);
    again.stop!();
    const renewed = harness();
    await main(['--http', '--new-secret', '--port', String(await freePort())], renewed.deps);
    expect(renewed.out[0]).not.toContain(kept);
    expect(renewed.out[0]).toContain(`/mcp/${secretOf(dir.root)}`);
  });

  it('--tunnel: the public URL with the same path, and how to add it', async () => {
    const port = await freePort();
    const close = vi.fn();
    const tunnel = vi.fn(() => Promise.resolve<TunnelResult>({ tunnel: { url: 'https://brave-otter-12.trycloudflare.com', close } }));
    const h = harness(tunnel);
    expect(await main(['--http', '--tunnel', '--port', String(port)], h.deps)).toBe(0);
    expect(tunnel).toHaveBeenCalledWith(port);
    const secret = secretOf(dir.root);
    expect(h.out[0]!.split('\n')).toEqual([
      'fudic MCP · project acme · http',
      `  local   http://127.0.0.1:${port}/mcp/${secret}`,
      `  public  https://brave-otter-12.trycloudflare.com/mcp/${secret}`,
      'Add the public URL in Claude: Settings → Connectors → Add custom connector.',
      'Anyone with this URL can read and write this project. Stop with Ctrl+C.',
      '',
    ]);
    h.stop!();
    delete h.stop;
    expect(close).toHaveBeenCalledOnce();
  });

  it('--tunnel without cloudflared: FUD1406, and it goes on locally', async () => {
    const port = await freePort();
    const h = harness(() => Promise.resolve({ missing: FUD1406() }));
    expect(await main(['--http', '--tunnel', '--port', String(port)], h.deps)).toBe(0);
    const lines = h.out[0]!.split('\n');
    expect(lines[1]).toMatch(/^ {2}local {3}http:\/\/127\.0\.0\.1:/u);
    expect(h.out[0]).toContain(`\n${format(FUD1406())}\nAnyone with this URL`);
    expect(lines[2]).toContain('FUD1406');
    expect(h.out[0]).not.toContain('  public  ');
    expect((await fetch(lines[1]!.trim().split(/\s+/u)[1]!, { method: 'GET' })).status).toBe(404);
  });

  it('--tunnel that fails: why, and it goes on locally', async () => {
    const h = harness(() => Promise.resolve({ failed: 'cloudflared exited with 1:\nERR' }));
    expect(await main(['--http', '--tunnel', '--port', String(await freePort())], h.deps)).toBe(0);
    expect(h.out[0]).toContain('  no public URL: cloudflared exited with 1:\nERR\n');
  });

  it('a port in use: says so, and fails', async () => {
    const busy = harness();
    const port = await freePort();
    await main(['--http', '--port', String(port)], busy.deps);
    const h = harness();
    expect(await main(['--http', '--port', String(port)], h.deps)).toBe(1);
    expect(h.err).toEqual([expect.stringMatching(new RegExp(`^fudic-mcp: cannot listen on 127\\.0\\.0\\.1:${port}: .*EADDRINUSE`, 'u'))]);
    expect(h.out).toEqual([]);
  });
});
