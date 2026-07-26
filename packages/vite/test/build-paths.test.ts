/**
 * SDD-19 §6.6 end-to-end: a `/customer/[id]` page with `@server paths()` prerenders one
 * HTML per enumerated id. `paramFallback:'lazy'` (default) also keeps a `dynamic:true`
 * entry for unknown ids; `'notFound'` does not (the route is `dynamic:false`).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fudic, type FudicOptions } from '../src/index.js';

const ssrDist = fileURLToPath(new URL('../../ssr/dist/index.js', import.meta.url));
const transportDist = fileURLToPath(new URL('../../transport/dist/index.js', import.meta.url));

const PAGE = `<!DOCTYPE html>
<html>
<head>
<title>Customer</title>
@code {
@server {
export function load(ctx) { return { id: ctx.params.id }; }
export function paths() { return ['1', '2']; }
}
}
</head>
<body>
<h1>Customer @data.id</h1>
</body>
</html>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly source?: string;
}

async function buildWith(options: FudicOptions): Promise<OutFile[]> {
  const root = mkdtempSync(join(tmpdir(), 'fudic-paths-'));
  mkdirSync(join(root, 'routes', 'customer'), { recursive: true });
  writeFileSync(join(root, 'routes', 'customer', '[id].fud'), PAGE);
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { '@fudic/ssr': ssrDist, '@fudic/transport': transportDist } },
    plugins: [fudic(options)],
    build: { write: false, minify: false },
  })) as unknown as { output: OutFile[] };
  return result.output;
}

const manifestOf = (output: OutFile[]): Array<Record<string, unknown>> =>
  JSON.parse(output.find((o) => o.fileName === 'fudic-routes.json')!.source as string);

describe('vite build — paths() enumeration (lazy fallback)', () => {
  let output: OutFile[];
  beforeAll(async () => {
    output = await buildWith({}); // paramFallback defaults to 'lazy'
  }, 120000);

  it('prerenders one HTML per enumerated id, each with its loaded data', () => {
    const one = output.find((o) => o.fileName === 'customer/1/index.html');
    const two = output.find((o) => o.fileName === 'customer/2/index.html');
    expect(one).toBeDefined();
    expect(two).toBeDefined();
    expect(one!.source as string).toContain('Customer 1');
    expect(two!.source as string).toContain('Customer 2');
  });

  it('keeps a dynamic:true entry for unknown ids (lazy)', () => {
    expect(manifestOf(output)[0]).toMatchObject({ pattern: '/customer/:id', dynamic: true });
  });
});

describe('vite build — paths() enumeration (notFound fallback)', () => {
  let output: OutFile[];
  beforeAll(async () => {
    output = await buildWith({ paramFallback: 'notFound' });
  }, 120000);

  it('still prerenders the enumerated ids', () => {
    expect(output.some((o) => o.fileName === 'customer/1/index.html')).toBe(true);
  });

  it('has no dynamic entry for unknown ids (notFound)', () => {
    expect(manifestOf(output)[0]).toMatchObject({ pattern: '/customer/:id', dynamic: false });
  });
});
