/**
 * SDD-19 §5 invariant + §6.6 edge: prerender never aborts the build. A `paths()` entry
 * that does not cover every param is skipped with FUD0362; a page that throws while
 * rendering is skipped with a `[prerender]` warning — the build still completes.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build, type Rollup } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';


interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
}

async function buildRoutes(files: Record<string, string>): Promise<{ output: OutFile[]; warnings: string[] }> {
  const root = mkdtempSync(join(tmpdir(), 'fudic-prerr-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, 'routes', rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  const warnings: string[] = [];
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    build: {
      write: false,
      minify: false,
      rollupOptions: { onwarn: (w: Rollup.RollupLog) => warnings.push(w.message) },
    },
  })) as unknown as { output: OutFile[] };
  return { output: result.output, warnings };
}

describe('prerender never aborts the build (§5)', () => {
  describe('a paths() entry missing a param (FUD0362)', () => {
    let output: OutFile[];
    let warnings: string[];
    beforeAll(async () => {
      const page = `<!DOCTYPE html>
<html>
<head>
@code {
@server {
export function load(ctx) { return { id: ctx.params.id }; }
export function paths() { return ['1', { wrong: 'x' }]; }
}
}
</head>
<body><h1>C @data.id</h1></body>
</html>
`;
      ({ output, warnings } = await buildRoutes({ 'customer/[id].fud': page }));
    }, 120000);

    it('prerenders the covered id and warns FUD0362 for the incomplete one', () => {
      expect(output.some((o) => o.fileName === 'customer/1/index.html')).toBe(true);
      expect(warnings.some((w) => w.includes('FUD0362'))).toBe(true);
      // The incomplete entry produced no file.
      expect(output.filter((o) => o.fileName.endsWith('index.html'))).toHaveLength(1);
    });
  });

  describe('a page that throws while rendering', () => {
    let output: OutFile[];
    let warnings: string[];
    beforeAll(async () => {
      // `boom` is undefined → the render throws a ReferenceError, caught per route.
      const page = `<!DOCTYPE html>
<html>
<head><title>Boom</title></head>
<body><h1>@(boom.value)</h1></body>
</html>
`;
      ({ output, warnings } = await buildRoutes({ 'boom.fud': page }));
    }, 120000);

    it('completes the build and warns [prerender], emitting no HTML for it', () => {
      expect(output.length).toBeGreaterThan(0); // build did not abort
      expect(warnings.some((w) => w.includes('[prerender]'))).toBe(true);
      expect(output.some((o) => o.fileName === 'boom/index.html')).toBe(false);
    });
  });
});
