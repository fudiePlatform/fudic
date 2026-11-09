/**
 * SDD-81 criterion 41: `node-server.mjs`, a dozen lines of `node:http` and `@fudic/server/node`
 * around `.fudic/edge/server.mjs`, serves the built example — a page, a function. It runs on the
 * build `pnpm build` left; without one it says so.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { fileURLToPath } from 'node:url';

interface Answer {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: string;
}

/** A request over node:http: the suite runs in happy-dom, whose fetch is a browser's. */
function ask(path: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(`${origin}${path}`, { method: init.method ?? 'GET', headers: init.headers ?? {} }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end(init.body);
  });
}

const root = fileURLToPath(new URL('..', import.meta.url));
const script = fileURLToPath(new URL('../node-server.mjs', import.meta.url));
const built = fileURLToPath(new URL('../.fudic/edge/server.mjs', import.meta.url));

let child: ChildProcess;
let origin = '';

beforeAll(async () => {
  if (!existsSync(built)) throw new Error('criterion 41 runs on the built example: run `vite build` in examples/basic first');
  child = spawn(process.execPath, [script], { cwd: root, env: { ...process.env, PORT: '0', FUDIC_SECURE_COOKIES: 'false' } });
  origin = await new Promise<string>((resolve, reject) => {
    let out = '';
    child.stdout!.on('data', (chunk: Buffer) => {
      out += chunk.toString();
      const port = /listening on (\d+)/u.exec(out)?.[1];
      if (port !== undefined) resolve(`http://127.0.0.1:${port}`);
    });
    child.stderr!.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.on('exit', (code) => reject(new Error(`node-server.mjs exited with ${String(code)}: ${out}`)));
  });
}, 30_000);

afterAll(() => {
  child?.kill();
});

describe('criterion 41: a Node adapter in a dozen lines', () => {
  it('is a dozen lines', () => {
    const lines = readFileSync(script, 'utf8').split('\n').filter((line) => line.trim() !== '');
    expect(lines.length).toBeLessThanOrEqual(12);
  });

  it('serves a page rendered on demand, with its CSP and nonce', async () => {
    const response = await ask(`/usuarios`, { headers: { accept: 'text/html' } });
    expect(response.status).toBe(200);
    const csp = String(response.headers['content-security-policy'] ?? '');
    const nonce = /'nonce-([^']+)'/u.exec(csp)?.[1];
    expect(nonce).toBeDefined();
    const html = response.body;
    expect(html).toContain('Ana');
    expect(html).toContain(`nonce="${nonce}"`);
  });

  it('serves a prerendered page', async () => {
    const response = await ask(`/about`, { headers: { accept: 'text/html' } });
    expect(response.status).toBe(200);
    expect(response.body).not.toContain('__FUDIC_NONCE__');
  });

  it('serves a function', async () => {
    const a = encodeURIComponent(JSON.stringify({ q: 'mar' }));
    const response = await ask(`/_fudic/fn/routes/usuarios/searchJson?a=${a}`);
    expect(response.status).toBe(200);
    const people = JSON.parse(response.body) as readonly { readonly name: string }[];
    expect(people.map((p) => p.name)).toEqual(['Marta']);
  });

  it('a navigation nothing answers is _error.fud as a 404', async () => {
    const response = await ask(`/no-existe`, { headers: { accept: 'text/html' } });
    expect(response.status).toBe(404);
  });
});
