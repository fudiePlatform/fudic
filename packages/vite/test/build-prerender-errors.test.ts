/**
 * What the prerender does with a route it cannot render.
 *
 * Two cases and they are NOT the same, which is the correction SDD-39 §4.11 brings. A
 * `paths()` entry that does not cover every param is one URL of a route that still has
 * others: it is skipped with FUD0362 and the build completes. A page that THROWS is a page
 * that does not exist, and shipping the site without it — with CI in green — is publishing
 * a hole. That is `FUD0620`, and it breaks the build (§6.17).
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
    const abs = join(root, 'src', 'routes', rel);
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

describe('what the prerender does with a route it cannot render', () => {
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

  describe('a page that throws while rendering (FUD0620, §6.17)', () => {
    it('fails the build instead of shipping a site with one page missing', async () => {
      // `boom` is undefined → the render throws a ReferenceError while prerendering.
      const page = `<!DOCTYPE html>
<html>
<head><title>Boom</title></head>
<body><h1>@(boom.value)</h1></body>
</html>
`;
      await expect(buildRoutes({ 'boom.fud': page })).rejects.toThrow(/FUD0620/u);
    }, 120000);
  });
});
