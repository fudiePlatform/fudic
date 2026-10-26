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
import { httpAlias, writeHttpTypecheckConfig } from './helpers/http-project.js';


interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
}

/** `files` by their path inside `src/`. */
async function buildRoutes(files: Record<string, string>): Promise<{ output: OutFile[]; warnings: string[] }> {
  const root = mkdtempSync(join(tmpdir(), 'fudic-prerr-'));
  writeHttpTypecheckConfig(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, 'src', rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  const warnings: string[] = [];
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: httpAlias },
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
<link rel="server" href="./[id].fudapi">
</head>
<body><h1>C @data.id</h1></body>
</html>
`;
      const api = 'load\n  id  str\n\npaths\n';
      // The entry that misses `id` is cast past the contract's `string`: what FUD0362 guards
      // is the run-time value, whatever the handler's types claimed.
      const server = `import { load, paths } from 'fudic:routes/customer/[id]';

load.handle((ctx) => ({ id: ctx.params.id }));
paths.handle(() => ['1', { wrong: 'x' } as unknown as string]);
`;
      ({ output, warnings } = await buildRoutes({
        'routes/customer/[id].fud': page,
        'routes/customer/[id].fudapi': api,
        'server/customer.ts': server,
      }));
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
      // Well typed and portable, and broken at run time: the first of an empty list is
      // undefined, and reading a field of it throws a TypeError while prerendering. A name that
      // does not exist would no longer get this far: since SDD-35 the typecheck stops the build
      // on it first (TS2304).
      const page = `<!DOCTYPE html>
<html>
<head>
@code {
  type Item = { n: number };
  const lista: readonly Item[] = [];
}
<title>Boom</title></head>
<body><h1>@(lista[0].n)</h1></body>
</html>
`;
      await expect(buildRoutes({ 'routes/boom.fud': page })).rejects.toThrow(/FUD0620/u);
    }, 120000);
  });
});
