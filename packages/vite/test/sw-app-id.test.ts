/**
 * BUG-33 criteria 7 and 8: the application's identity reaches the worker.
 *
 * It comes from the project's `fudic.json` and never from a plugin option — the identity of
 * an application belongs to the project (SDD-41 §3.3) — and it arrives as a literal rather
 * than a token, because it is known at config time. That matters beyond tidiness: the build
 * id is still the ONLY substitution made on the emitted code, and it still measures exactly
 * what its token measures, so the map generated for the worker keeps describing it.
 */

import { describe, it, expect } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILD_ID_LENGTH } from '@fudic/transport';
import { fudic } from '../src/index.js';
import { emitSwBootstrap } from '../src/bootstrap.js';
import { BUILD_TOKEN } from '../src/constants.js';
import { runtimeAlias } from './helpers/alias.js';

const PAGE = `<!DOCTYPE html>
<html>
<head><title>Home</title></head>
<body><h1>Home</h1></body>
</html>
`;

interface OutFile {
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
}

function textOf(file: OutFile | undefined): string {
  return file === undefined ? '' : (file.code ?? String(file.source ?? ''));
}

/** Build a project whose `fudic.json` declares `id`, with the Service Worker on. */
async function buildWithId(id: string, sourcemap = false): Promise<readonly OutFile[]> {
  const root = mkdtempSync(join(tmpdir(), 'fudic-appid-'));
  mkdirSync(join(root, 'routes'), { recursive: true });
  writeFileSync(join(root, 'routes', 'index.fud'), PAGE);
  writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: [] }));
  writeFileSync(join(root, 'fudic.json'), JSON.stringify({ id }));

  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    build: { write: false, minify: false, sourcemap },
  })) as unknown as { output: readonly OutFile[] };
  return result.output;
}

/** The id as the bundler leaves it: a string literal, in whichever quote it chose. */
function carriesId(code: string, id: string): boolean {
  return new RegExp(`["'\`]${id}["'\`]`, 'u').test(code);
}

describe('the app id reaches the emitted Service Worker (criterion 7)', () => {
  it('the worker is written with APP next to BUILD, and names its caches from both', () => {
    // Asserted on the SOURCE the plugin emits, because the nested build then renames every
    // binding: `const APP` survives as `Le` and only its VALUE is recognisable afterwards.
    const source = emitSwBootstrap({
      manifestUrlExpr: '"/fudic-routes.json"',
      shell: [],
      resources: [],
      app: 'shop',
    });

    expect(source).toContain('const APP = "shop";');
    expect(source).toContain(`const BUILD = "${BUILD_TOKEN}";`);
    expect(source).toContain('cacheNames(APP, BUILD)');
    expect(source).toContain('isStaleCache(name, APP, BUILD)');
  });

  it('and each built worker carries the id ITS project declared, and not the other one', async () => {
    // Two ids that cannot turn up by accident in bundled framework code.
    const uno = textOf((await buildWithId('alfa-uno')).find((o) => o.fileName === 'fudic-sw.js'));
    const dos = textOf((await buildWithId('beta-dos')).find((o) => o.fileName === 'fudic-sw.js'));

    expect(carriesId(uno, 'alfa-uno')).toBe(true);
    expect(carriesId(uno, 'beta-dos')).toBe(false);
    expect(carriesId(dos, 'beta-dos')).toBe(true);
    expect(carriesId(dos, 'alfa-uno')).toBe(false);
  }, 180000);
});

describe('the substitution stays the only one, and stays the same width (criterion 8)', () => {
  it('the token measures exactly a build id', () => {
    // If these two ever disagree, substituting the build id shifts every column after it
    // and the worker's map validates while lying (BUG-05 §4.4).
    expect(BUILD_TOKEN.length).toBe(BUILD_ID_LENGTH);
  });

  it('a build with sourcemap still produces a map for the worker', async () => {
    const output = await buildWithId('shop', true);

    const map = output.find((o) => o.fileName === 'fudic-sw.js.map');
    expect(map).toBeDefined();
    const parsed = JSON.parse(textOf(map)) as { version: number; mappings: string };
    expect(parsed.version).toBe(3);
    expect(parsed.mappings.length).toBeGreaterThan(0);

    // And the token is gone from what was emitted: substituted, once, by the real id.
    const sw = textOf(output.find((o) => o.fileName === 'fudic-sw.js'));
    expect(sw).not.toContain(BUILD_TOKEN);
    expect(carriesId(sw, 'shop')).toBe(true);
  }, 180000);
});
