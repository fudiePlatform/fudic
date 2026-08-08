/**
 * SDD-27 §5.1, the regression that guards the prune.
 *
 * After the prune, `assets/c/` is empty and the `page` pass looks like dead code. It is
 * not: it is the ONLY pass that makes Vite emit the linked asset FILES. The link pass runs
 * with `write: false` and re-emits chunks only, so `sw/c` REFERENCES `logo-<hash>.png`
 * while `page` PRODUCES it. Delete the `emitFile` of the page wrappers in `plugin.ts` and
 * every `<img>` in the app points at a file the build never wrote.
 *
 * This test exists to fail loudly at that moment, and for no other reason.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';
import { allCode } from './helpers/output.js';

const PAGE = `<!DOCTYPE html>
<html>
<head><title>Home</title></head>
<body>
<img src="./logo.png">
</body>
</html>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
}

let output: OutFile[];

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-prune-asset-'));
  mkdirSync(join(root, 'src', 'routes'), { recursive: true });
  writeFileSync(join(root, 'src', 'routes', 'index.fud'), PAGE);
  // Over the default inline limit in BOTH builds: an inlined data URI would prove nothing,
  // because then no file has to exist for the reference to resolve.
  writeFileSync(join(root, 'src', 'routes', 'logo.png'), Buffer.alloc(5000, 7));
  writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: ['/fudic-main.js'] }));
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    build: { write: false, minify: false, assetsInlineLimit: 0 },
  })) as unknown as { output: OutFile[] };
  output = result.output;
}, 120000);

describe('the linked assets survive the prune of the page pass', () => {
  it('the page chunks ARE gone — otherwise this test proves nothing', () => {
    expect(output.some((o) => o.fileName.startsWith('assets/c/'))).toBe(false);
  });

  it('the hashed asset file is still emitted', () => {
    const png = output.find((o) => /logo-[\w-]+\.png$/u.test(o.fileName));
    expect(png).toBeDefined();
  });

  it('the chunk the Service Worker links points at a file the build wrote', () => {
    // The whole invariant in one assertion: reference and file, produced by two different
    // passes, agreeing on a name.
    const png = output.find((o) => /logo-[\w-]+\.png$/u.test(o.fileName))!;
    const linked = output.filter((o) => o.fileName.startsWith('sw/c/') && o.fileName.endsWith('.js'));
    expect(linked.length).toBeGreaterThan(0);
    const code = allCode(linked);
    expect(code).toContain(png.fileName.replace(/^.*\//u, ''));
    expect(code).not.toContain('"./logo.png"');
  });
});
