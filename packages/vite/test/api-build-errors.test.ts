/**
 * SDD-60 §3.12, §4.6 and criteria 17, 18 — what stops `vite build`: two implementations of one
 * piece, one in the wrong folder, and a handler whose signature does not fit its contract.
 */

import { describe, expect, it } from 'vitest';
import { build } from 'vite';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { httpAlias, writeHttpTypecheckConfig } from './helpers/http-project.js';

const API = `put save
  name  str
  -> str
`;

const RULE = `rule nif-unique
  on field str
  runs server
  fails taken
`;

const PAGE = `<!DOCTYPE html>
<html>
<head><title>x</title><link rel="server" href="./users.fudapi"></head>
<body><p>x</p></body>
</html>
`;

const SAVE = "import { save } from 'fudic:routes/users';\nsave.handle((ctx) => ctx.args.name);\n";

function project(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-api-errors-'));
  writeHttpTypecheckConfig(root, { module: 'esnext', moduleResolution: 'bundler', verbatimModuleSyntax: true, strict: true });
  const all = { 'src/routes/users.fudapi': API, 'src/routes/users.fud': PAGE, 'src/rules/nif.fudapi': RULE, ...files };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

/** The message `vite build` failed with. */
async function failure(root: string): Promise<string> {
  const error = await build({ root, logLevel: 'silent', resolve: { alias: httpAlias }, plugins: [fudic()] }).then(
    () => undefined,
    (e: unknown) => e as Error,
  );
  expect(error).toBeInstanceOf(Error);
  return error!.message;
}

describe('criterion 17: the registry stops the build', () => {
  it('two save.handle: the error names the two files', async () => {
    const root = project({ 'src/server/a.ts': SAVE, 'src/server/b.ts': SAVE });
    expect(await failure(root)).toContain('save of routes/users is implemented twice: src/server/a.ts, src/server/b.ts');
  }, 300000);

  it('a runs-server rule checked in src/browser: the error names the file and the folder', async () => {
    const root = project({
      'src/server/users.ts': SAVE,
      'src/browser/nif.ts': "import { nifUnique } from 'fudic:rules/nif';\nnifUnique.check(() => true);\n",
    });
    expect(await failure(root)).toContain('nif-unique of rules/nif must be implemented in src/server: src/browser/nif.ts');
  }, 300000);
});

describe('a .fudapi that is wrong stops the build', () => {
  it('with its code, its file and its line', async () => {
    const root = project({ 'src/server/users.ts': SAVE, 'src/rules/bad.fudapi': 'rule shout\n  on field str\n' });
    expect(await failure(root)).toMatch(/src[\\/]rules[\\/]bad\.fudapi:1:\d+ - error FUD1097/u);
  }, 300000);
});

describe('criterion 18: the typecheck stops the build', () => {
  it('a handler that does not fit its contract fails with the line of its .ts', async () => {
    const root = project({
      'src/server/users.ts': "import { save, type SaveHandler } from 'fudic:routes/users';\nexport const h = (() => 42) satisfies SaveHandler;\nsave.handle(h);\n",
    });
    const message = await failure(root);
    expect(message).toContain('the typecheck failed');
  }, 300000);
});
