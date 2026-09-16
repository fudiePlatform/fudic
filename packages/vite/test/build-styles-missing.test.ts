/**
 * SDD-42 §5, criterion 10 on the build side: a `styles` entry that names a file which is
 * not there stops the build (`FUD0740`).
 *
 * Fatal, unlike a malformed `fudic.json`, and the difference is whether there is a correct
 * behaviour to degrade to. A project with no configuration renders as it did before SDD-41;
 * a project whose style guide silently did not load renders like a project that has none,
 * and looks exactly the same in the terminal.
 */

import { describe, it, expect } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';

const PAGE = `<!DOCTYPE html>
<html>
<head><title>Home</title></head>
<body><h1>hola</h1></body>
</html>
`;

/** A project whose `fudic.json` declares `styles`, with whatever sheets are given. */
async function buildWith(styles: readonly string[], sheets: Record<string, string>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'fudic-styles-'));
  mkdirSync(join(root, 'src', 'routes'), { recursive: true });
  mkdirSync(join(root, 'src', 'styles'), { recursive: true });
  writeFileSync(join(root, 'src', 'routes', 'index.fud'), PAGE);
  writeFileSync(join(root, 'fudic.json'), JSON.stringify({ id: 'test', styles }));
  for (const [name, css] of Object.entries(sheets)) {
    writeFileSync(join(root, name), css);
  }
  await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    build: { write: false, minify: false },
  });
}

describe('vite build — the project style guide', () => {
  it('FUD0740: a sheet that is not there stops the build, naming the path as written', async () => {
    await expect(buildWith(['src/styles/theme.css'], {})).rejects.toThrow(/FUD0740/u);
  }, 120000);

  it('FUD0741: two sheets that would adopt under the same specifier stop it too', async () => {
    await expect(
      buildWith(['src/styles/theme.css', 'src/routes/theme.css'], {
        'src/styles/theme.css': '.a{color:red}',
        'src/routes/theme.css': '.b{color:blue}',
      }),
    ).rejects.toThrow(/FUD0741/u);
  }, 120000);

  it('and a guide that resolves builds, which is the case that must not have regressed', async () => {
    await expect(
      buildWith(['src/styles/theme.css'], { 'src/styles/theme.css': ':host{--gap:8px}' }),
    ).resolves.toBeUndefined();
  }, 120000);
});
