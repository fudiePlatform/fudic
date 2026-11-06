/**
 * SDD-60 §3.12, §4.6 and criteria 17, 18 — what stops `vite build`: two implementations of one
 * piece, one in the wrong folder, and a handler whose signature does not fit its contract.
 */

import { describe, expect, it } from 'vitest';
import { build, createLogger } from 'vite';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProjectChecker } from '@fudic/typecheck';
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

/** The message `vite build` failed with; what it logged as errors and warnings goes to `logged`. */
async function failure(root: string, logged: string[] = []): Promise<string> {
  const customLogger = createLogger('silent');
  customLogger.error = (text) => void logged.push(text);
  customLogger.warn = (text) => void logged.push(text);
  const error = await build({ root, customLogger, resolve: { alias: httpAlias }, plugins: [fudic()] }).then(
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
  it('as the typecheck: its code, its file and its line in the log, then one failure with the count', async () => {
    const root = project({ 'src/server/users.ts': SAVE, 'src/rules/bad.fudapi': 'rule shout\n  on field str\n' });
    const logged: string[] = [];
    const message = await failure(root, logged);
    // The rule lacks `runs` and `fails`: two problems of one file, each printed once.
    expect(message).toContain('the typecheck failed: 2 errors in 1 file');
    expect(message).not.toContain('FUD1097');
    const problems = logged.filter((text) => text.includes('FUD1097'));
    expect(problems).toHaveLength(2);
    for (const problem of problems) expect(problem).toMatch(/^src[\\/]rules[\\/]bad\.fudapi:1:6 - error FUD1097/u);
    expect(problems.map((p) => p.split('\n')[0])).toEqual([
      'src/rules/bad.fudapi:1:6 - error FUD1097: rule `shout` needs `fails`',
      'src/rules/bad.fudapi:1:6 - error FUD1097: rule `shout` needs `runs`',
    ]);
  }, 300000);
});

describe('SDD-77 criterion 5: a broken .fudspec breaks the build too, once', () => {
  it('with a .fudapi that is wrong: one failure, each problem once, where check() puts it', async () => {
    const term = "export const meta = { name: 'shown', block: 'then', params: [] };\nexport async function run(ctx) {}\nexport const selfTest = [];\n";
    const badge = '<app-badge>\n  <template shadowrootmode="open"><span>x</span></template>\n</app-badge>\n';
    const root = project({
      'src/server/users.ts': SAVE,
      'src/rules/bad.fudapi': 'rule shout\n  on field str\n  runs server\n',
      'fudic/terms/then/shown.js': term,
      'src/components/app-badge.fud': badge,
      'src/components/app-badge.fudspec': 'component app-badge\n\ncriterion shows\n  then\n    nowhere\n',
    });
    const logged: string[] = [];
    const message = await failure(root, logged);
    expect(message).toContain('the typecheck failed: 2 errors in 2 files');

    const firstLines = logged.filter((t) => /FUD\d{4}/u.test(t)).map((t) => t.split('\n')[0]);
    expect(firstLines).toEqual([
      expect.stringMatching(/^src\/components\/app-badge\.fudspec:5:5 - error FUD0940: /u),
      'src/rules/bad.fudapi:1:6 - error FUD1097: rule `shout` needs `fails`',
    ]);

    // The same codes at the same places as the project check the editor and the MCP read.
    const report = createProjectChecker({ root }).check();
    expect(report.problems.map((p) => [p.file.replace(/\\/gu, '/').slice(root.replace(/\\/gu, '/').length + 1), p.code])).toEqual([
      ['src/components/app-badge.fudspec', 'FUD0940'],
      ['src/rules/bad.fudapi', 'FUD1097'],
    ]);
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
