/**
 * SDD-19 end-to-end for the canonical param route `/customer/[id]` with `@server
 * load`: a real `vite build` emits a `/customer/:id` incremental entry and a chunk
 * that extracts params from the baked pattern and bundles the `?server` `load`.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fudic } from '../src/index.js';

const ssrDist = fileURLToPath(new URL('../../ssr/dist/index.js', import.meta.url));
const transportDist = fileURLToPath(new URL('../../transport/dist/index.js', import.meta.url));

const PAGE = `<!DOCTYPE html>
<html>
<head>
@code {
@server {
export function load(ctx) { return { id: ctx.params.id }; }
}
}
</head>
<body>
<h1>Customer</h1>
</body>
</html>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string;
}

let output: OutFile[];

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-param-'));
  mkdirSync(join(root, 'routes', 'customer'), { recursive: true });
  writeFileSync(join(root, 'routes', 'customer', '[id].fud'), PAGE);
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { '@fudic/ssr': ssrDist, '@fudic/transport': transportDist } },
    plugins: [fudic()],
    build: { write: false, minify: false },
  })) as unknown as { output: OutFile[] };
  output = result.output;
}, 120000);

describe('vite build — param route with @server load', () => {
  it('emits an incremental /customer/:id manifest entry', () => {
    const asset = output.find((o) => o.type === 'asset' && o.fileName === 'fudic-routes.json');
    const manifest = JSON.parse(asset!.source as string) as Array<Record<string, unknown>>;
    expect(manifest).toHaveLength(1);
    expect(manifest[0]).toMatchObject({ pattern: '/customer/:id', dynamic: true });
  });

  it('bundles a chunk that extracts params and runs load', () => {
    const code = output
      .filter((o) => o.type === 'chunk')
      .map((c) => c.code ?? '')
      .join('\n');
    expect(code).toContain('SEGMENTS'); // the baked pattern, param extraction
    expect(code).toContain('extractParams');
    expect(code).toContain('ctx.params.id'); // the @server load, bundled from ?server
  });
});
