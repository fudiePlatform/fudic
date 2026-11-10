/**
 * `staticFiles`: the build's own files on Node, after `nodeMiddleware` (SDD-81 §3.10, criterion
 * 41) — what `fetch` leaves to the host.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { staticFiles } from '../src/node/index.js';

let dir: string;
let server: Server;
let origin: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'fudic-files-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'app.js'), 'export {};');
  writeFileSync(join(dir, 'assets', 'data.bin'), Buffer.from([1, 2, 3]));
  writeFileSync(join(dir, 'outside.txt'), 'no');
  const files = staticFiles(join(dir, 'assets'));
  server = createServer((req, res) => files(req, res, () => res.writeHead(404).end('next')));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  origin = `http://127.0.0.1:${String(address.port)}`;
});

afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

function ask(path: string, method = 'GET'): Promise<{ status: number; type: string | undefined; length: string | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(`${origin}${path}`, { method }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, type: res.headers['content-type'], length: res.headers['content-length'], body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('staticFiles', () => {
  it('a file of the build, with its type and length', async () => {
    expect(await ask('/app.js?v=1')).toEqual({ status: 200, type: 'text/javascript; charset=utf-8', length: '10', body: 'export {};' });
  });

  it('a type it does not know goes out as bytes; HEAD says the same with no body', async () => {
    expect((await ask('/data.bin')).type).toBe('application/octet-stream');
    expect(await ask('/app.js', 'HEAD')).toEqual({ status: 200, type: 'text/javascript; charset=utf-8', length: '10', body: '' });
  });

  it('what is no file goes on: a missing one, a directory, the root, another method, a bad path', async () => {
    for (const path of ['/nope.js', '/', '/%E0%A4%A']) expect((await ask(path)).body).toBe('next');
    expect((await ask('/app.js', 'POST')).body).toBe('next');
    mkdirSync(join(dir, 'assets', 'sub'));
    expect((await ask('/sub')).body).toBe('next');
  });

  it('never leaves its directory', async () => {
    // `..` is resolved by the URL itself; a backslash is a separator on Windows.
    expect((await ask('/..%5Coutside.txt')).body).toBe('next');
    expect((await ask('/../outside.txt')).body).toBe('next');
  });
});
