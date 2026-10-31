/**
 * SDD-70 §3.10, criterion 30 — the early hints of each route in `fudic-routes.json`, from a real
 * `vite build`: the copies of the sheets its head links, then the entries it loads and their
 * static imports in depth, under the build's id. `earlyHints: false` writes none.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias, writeTypecheckConfig } from './helpers/alias.js';
import { manifestFile } from './helpers/manifest.js';
import type { ManifestFile } from '@fudic/transport';

/** A component that hydrates: what makes the page load `main`. */
const COUNTER = `@code {
  import { signal } from '@fudic/core';

  const n = signal(0);

  function inc() {
    n.set(n() + 1);
  }
}

<x-counter>
  <template shadowrootmode="open">
    <button @click="@inc">@n()</button>
  </template>
</x-counter>
`;

const HYDRATES = `<!DOCTYPE html>
<html>
<head>
  <link rel="component" href="../components/x-counter.fud">
  <link rel="stylesheet" href="../styles/site.css">
  <title>Cuenta</title>
</head>
<body><p>texto</p><x-counter></x-counter></body>
</html>
`;

const STATIC = `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="../styles/site.css">
  <title>Quieta</title>
</head>
<body><p>texto</p></body>
</html>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: unknown;
}

const ERROR_PAGE = `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="../styles/error.css">
  <title>Error</title>
</head>
<body><h1 class="e">@data.status</h1></body>
</html>
`;

async function built(config: Record<string, unknown>, errorPage = false): Promise<ManifestFile> {
  const root = mkdtempSync(join(tmpdir(), 'fudic-hints-'));
  writeTypecheckConfig(root);
  for (const dir of ['src/routes', 'src/components', 'src/styles']) mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, 'src/components/x-counter.fud'), COUNTER);
  writeFileSync(join(root, 'src/styles/site.css'), 'p { color: red }\n');
  writeFileSync(join(root, 'src/routes/index.fud'), HYDRATES);
  writeFileSync(join(root, 'src/routes/quieta.fud'), STATIC);
  if (errorPage) {
    writeFileSync(join(root, 'src/styles/error.css'), '.e { color: blue }\n');
    writeFileSync(join(root, 'src/routes/_error.fud'), ERROR_PAGE);
  }
  writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: [] }));
  writeFileSync(join(root, 'fudic.json'), JSON.stringify({ id: 'hints', ...config }));
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    build: { write: false, minify: false },
  })) as unknown as { output: OutFile[] };
  return manifestFile(result.output);
}

const hintsOf = (manifest: ManifestFile, pattern: string): readonly string[] | undefined =>
  manifest.routes.find((r) => r.pattern === pattern)!.hints;

describe('the early hints in the route manifest (criterion 30)', () => {
  let manifest: ManifestFile;

  beforeAll(async () => {
    manifest = await built({});
  }, 120_000);

  it('a page that hydrates: its sheet, `boot`, `main` and the runtime under `main`', () => {
    const hints = hintsOf(manifest, '/')!;
    expect(hints[0]).toMatch(/^<\/assets\/site-[\w-]+\.css>; rel=preload; as=style$/u);
    expect(hints[1]).toBe(`</fudic-boot-${manifest.build}.js>; rel=modulepreload`);
    expect(hints[2]!.startsWith('</fudic-main-')).toBe(true);
    expect(hints[2]!.endsWith(`-${manifest.build}.js>; rel=modulepreload`)).toBe(true);
    // Here the runtime is bundled into the app (the test aliases it to `dist`), so what `main`
    // imports are chunks of the bundle; a linked runtime puts its `/_fudic/` pieces here instead.
    const imported = hints.slice(3);
    expect(imported.length).toBeGreaterThan(0);
    for (const hint of imported) expect(hint).toMatch(/^<\/assets\/[^>]+\.js>; rel=modulepreload$/u);
    // No component chunk: those are asked for when they hydrate.
    expect(hints.some((h) => h.includes('x-counter'))).toBe(false);
  });

  it('a page that does not hydrate: its sheet and `boot`, and no `main`', () => {
    const hints = hintsOf(manifest, '/quieta')!;
    expect(hints).toHaveLength(2);
    expect(hints[0]).toMatch(/^<\/assets\/site-[\w-]+\.css>; rel=preload; as=style$/u);
    expect(hints[1]).toBe(`</fudic-boot-${manifest.build}.js>; rel=modulepreload`);
  });
});

describe('`errorHints`: the hints of `_error.fud` (SDD-73 §3.3, criterion 1)', () => {
  it('its sheet and `boot`, at the top of the manifest; none without `_error.fud`', async () => {
    const manifest = await built({}, true);
    expect(manifest.errorHints).toHaveLength(2);
    expect(manifest.errorHints![0]).toMatch(/^<\/assets\/error-[\w-]+\.css>; rel=preload; as=style$/u);
    expect(manifest.errorHints![1]).toBe(`</fudic-boot-${manifest.build}.js>; rel=modulepreload`);
    expect('errorHints' in (await built({}))).toBe(false);
  }, 240_000);
});

describe('`earlyHints: false`', () => {
  it('writes no hints on any route, nor on the error page', async () => {
    const manifest = await built({ earlyHints: false }, true);
    expect(manifest.routes.every((r) => !('hints' in r))).toBe(true);
    expect('errorHints' in manifest).toBe(false);
  }, 120_000);
});
