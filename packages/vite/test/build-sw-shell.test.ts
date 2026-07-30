/**
 * BUG-01 §6.9: FUD0391 stops being decorative. Every `shell` entry of `sw.json` is
 * checked against what the build actually produced, and a missing one is a warning at
 * BUILD time — where the developer can fix it — instead of a silent `catch` in the
 * install, at runtime, on the client.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build, type Rollup } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fudic } from '../src/index.js';
import { missingShellEntries } from '../src/plugin.js';

const ssrDist = fileURLToPath(new URL('../../ssr/dist/index.js', import.meta.url));
const transportDist = fileURLToPath(new URL('../../transport/dist/index.js', import.meta.url));

const PAGE = `<!DOCTYPE html>
<html>
<head><title>Home</title></head>
<body><h1>Home</h1></body>
</html>
`;

/** Build a project whose `sw.json` declares `shell`, collecting the plugin's warnings. */
async function buildWithShell(shell: readonly string[]): Promise<string[]> {
  const warnings: string[] = [];
  const root = mkdtempSync(join(tmpdir(), 'fudic-shell-'));
  mkdirSync(join(root, 'routes'), { recursive: true });
  mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(join(root, 'routes', 'index.fud'), PAGE);
  writeFileSync(join(root, 'public', 'logo.svg'), '<svg/>');
  writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell }));
  await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { '@fudic/ssr': ssrDist, '@fudic/transport': transportDist } },
    plugins: [fudic()],
    build: {
      write: false,
      minify: false,
      rollupOptions: { onwarn: (w: Rollup.RollupLog) => warnings.push(w.message) },
    },
  });
  return warnings;
}

describe('vite build — the declared shell is validated (FUD0391)', () => {
  let bad: string[];
  let good: string[];

  beforeAll(async () => {
    bad = await buildWithShell(['/no-existe.js']);
    // `fudic-main.js` is emitted by the build; `logo.svg` is copied from `public/`.
    good = await buildWithShell(['/fudic-main.js', '/logo.svg']);
  }, 180000);

  it('warns FUD0391 naming the entry that is not in the output', () => {
    expect(bad.some((w) => w.includes('FUD0391') && w.includes('/no-existe.js'))).toBe(true);
  });

  it('says nothing for a shell that is entirely there, `public/` included', () => {
    expect(good.filter((w) => w.includes('FUD0391'))).toEqual([]);
  });
});

describe('missingShellEntries', () => {
  const emitted = new Set(['fudic-main.js', 'assets/style-abc.css']);

  it('strips the site base before looking the entry up', () => {
    expect(missingShellEntries(['/app/fudic-main.js'], '/app/', emitted, '')).toEqual([]);
    expect(missingShellEntries(['/fudic-main.js'], '/', emitted, '')).toEqual([]);
  });

  it('ignores the query string and reports what is genuinely absent', () => {
    expect(missingShellEntries(['/assets/style-abc.css?v=1'], '/', emitted, '')).toEqual([]);
    expect(missingShellEntries(['/gone.js'], '/', emitted, '')).toEqual(['/gone.js']);
  });

  it('never reports a cross-origin URL: it is not this build to check', () => {
    expect(missingShellEntries(['https://cdn.test/font.woff2'], '/', emitted, '')).toEqual([]);
  });
});
