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
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';


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
  writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: [] }));
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    build: { write: false, minify: false },
  })) as unknown as { output: OutFile[] };
  output = result.output;
}, 120000);

describe('vite build — param route with @server load', () => {
  it('emits a sw /customer/:id entry with its chunk and generated data endpoint', () => {
    const asset = output.find((o) => o.type === 'asset' && o.fileName === 'fudic-routes.json');
    const manifest = JSON.parse(asset!.source as string) as {
      routes: Array<Record<string, unknown>>;
    };
    expect(manifest.routes).toHaveLength(1);
    expect(manifest.routes[0]).toMatchObject({
      pattern: '/customer/:id',
      mode: 'sw',
      data: '/_fudic/data/customer/:id',
    });
  });

  it('BUG-09 keeps the @server load out of EVERY published file', () => {
    // This used to read «the edge chunk has it, the linked one does not». The edge chunk
    // was a chunk of the CLIENT build, so «has it» meant «publishes it». The edge wrapper
    // is built apart now and written outside `outDir`, and the answer is the same for the
    // whole output: nobody carries `load`.
    for (const file of output) {
      const text = file.code ?? ((file.source ?? '') as string);
      expect(text).not.toContain('ctx.params.id');
    }

    // The linked chunk keeps its shape: the SW gets its data already resolved from the
    // generated endpoint (SDD-20 §4.5).
    const linked = output.find((o) => o.fileName.startsWith('sw/c/') && o.fileName.endsWith('.js'));
    expect(linked).toBeDefined();
    expect((linked!.source ?? '') as string).toMatch(/exports\.render\s*=/u);
  });
});
