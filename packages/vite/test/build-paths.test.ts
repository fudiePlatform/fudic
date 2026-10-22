/**
 * SDD-19 §6.6 end-to-end: a `/customer/[id]` page whose `.fudapi` declares `paths` prerenders one
 * HTML per enumerated id. `paramFallback:'lazy'` (default) also renders
 * unknown ids in the Service Worker; `'notFound'` does not (the route stays `ssg`).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic, type FudicOptions } from '../src/index.js';
import { httpAlias, writeHttpTypecheckConfig } from './helpers/http-project.js';
import { renderUrlOf } from './helpers/manifest.js';


const PAGE = `<!DOCTYPE html>
<html>
<head>
<title>Customer</title>
<link rel="server" href="./[id].fudapi">
</head>
<body>
<h1>Customer @data.id</h1>
</body>
</html>
`;

/** No mode: the inference of today decides it from `load`, `paths` and `paramFallback`. */
const PAGE_API = `load
  id  str

paths
`;

const PAGE_SERVER = `import { load, paths } from 'fudic:routes/customer/[id]';

load.handle((ctx) => ({ id: ctx.params.id }));
paths.handle(() => ['1', '2']);
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly source?: string;
}

async function buildWith(options: FudicOptions): Promise<OutFile[]> {
  const root = mkdtempSync(join(tmpdir(), 'fudic-paths-'));
  mkdirSync(join(root, 'src', 'routes', 'customer'), { recursive: true });
  writeHttpTypecheckConfig(root);
  writeFileSync(join(root, 'src', 'routes', 'customer', '[id].fud'), PAGE);
  writeFileSync(join(root, 'src', 'routes', 'customer', '[id].fudapi'), PAGE_API);
  mkdirSync(join(root, 'src', 'server'), { recursive: true });
  writeFileSync(join(root, 'src', 'server', 'customer.ts'), PAGE_SERVER);
  writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: [] }));
  writeFileSync(join(root, 'fudic.json'), JSON.stringify({ id: 'test' }));
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: httpAlias },
    plugins: [fudic(options)],
    build: { write: false, minify: false },
  })) as unknown as { output: OutFile[] };
  return result.output;
}

const manifestOf = (output: OutFile[]): Array<Record<string, unknown>> =>
  (
    JSON.parse(output.find((o) => o.fileName === 'fudic-routes.json')!.source as string) as {
      routes: Array<Record<string, unknown>>;
    }
  ).routes;

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

  it('renders unknown ids locally, from its chunk — never from a per-route HTML file', () => {
    const record = manifestOf(output)[0];
    expect(record).toMatchObject({ pattern: '/customer/:id', mode: 'sw' });
    expect(renderUrlOf(output, '/customer/:id')).toMatch(/^\/sw\/c\/customer-id-[\w-]+\.js$/u);
    // BUG-02: the prerendered files still exist, for the FIRST visit. The manifest —
    // the client contract — does not name them.
    expect(record).not.toHaveProperty('html');
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

  it('is pure ssg: an unknown id is a 404, never a local render', () => {
    expect(manifestOf(output)[0]).toMatchObject({ pattern: '/customer/:id', mode: 'ssg' });
    // No `deps` key at all: its absence is what makes the route unrenderable in the SW.
    expect(manifestOf(output)[0]!['deps']).toBeUndefined();
    expect(renderUrlOf(output, '/customer/:id')).toBeNull();
  });
});
