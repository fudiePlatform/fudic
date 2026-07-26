/**
 * SDD-19 §6.13: a literal `src` to a file that does not exist raises FUD0363 as a warning
 * and is left as a literal — the build completes (does not abort). A sibling asset that
 * does exist is still linked and emitted hashed, proving only the missing one is skipped.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build, type Rollup } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fudic } from '../src/index.js';

const ssrDist = fileURLToPath(new URL('../../ssr/dist/index.js', import.meta.url));
const transportDist = fileURLToPath(new URL('../../transport/dist/index.js', import.meta.url));

const PAGE = `<!DOCTYPE html>
<html>
<head><title>Home</title></head>
<body>
<img src="./missing.png">
<img src="./present.png">
</body>
</html>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
}

let output: OutFile[];
const warnings: string[] = [];

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-missing-'));
  mkdirSync(join(root, 'routes'), { recursive: true });
  writeFileSync(join(root, 'routes', 'index.fud'), PAGE);
  writeFileSync(join(root, 'routes', 'present.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 9]));
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { '@fudic/ssr': ssrDist, '@fudic/transport': transportDist } },
    plugins: [fudic()],
    build: {
      write: false,
      minify: false,
      assetsInlineLimit: 0,
      rollupOptions: { onwarn: (w: Rollup.RollupLog) => warnings.push(w.message) },
    },
  })) as unknown as { output: OutFile[] };
  output = result.output;
}, 120000);

describe('vite build — missing asset (FUD0363)', () => {
  it('completes the build (does not abort) and warns FUD0363 for the missing asset', () => {
    expect(output.length).toBeGreaterThan(0); // the build produced output → it did not abort
    expect(warnings.some((w) => w.includes('FUD0363') && w.includes('missing.png'))).toBe(true);
  });

  it('leaves the missing URL as a literal but links the existing asset', () => {
    const code = output
      .filter((o) => o.type === 'chunk')
      .map((c) => c.code ?? '')
      .join('\n');
    expect(code).toContain('"./missing.png"'); // kept as a literal (not an import → no abort)
    const present = output.find((o) => o.type === 'asset' && /present-[\w-]+\.png$/u.test(o.fileName));
    expect(present).toBeDefined(); // the existing sibling WAS linked and emitted hashed
  });
});
