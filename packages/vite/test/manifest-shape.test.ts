/**
 * SDD-27 §5.4 and criteria 7 and 11: what the published manifest is allowed to contain.
 *
 * The unit tests of `manifest.ts` check the assembly; this checks the ARTIFACT — a real
 * `vite build`, its `fudic-routes.json` parsed, and the two properties that are easy to
 * lose without any test going red: not one URL anywhere in it, and a size budget.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileManifest, type ManifestFile } from '@fudic/transport';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';
import { manifestFile, emitted } from './helpers/manifest.js';

const NAV = `<site-nav>
  <template shadowrootmode="open">
    <nav><slot></slot></nav>
  </template>
</site-nav>
`;

/** `up` is the climb from the route's own directory to the project root. */
const page = (title: string, up: string): string => `<!DOCTYPE html>
<html>
<head>
  <link rel="component" href="${up}components/site-nav.fud">
  <title>${title}</title>
</head>
<body><site-nav>ok</site-nav></body>
</html>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string;
}

let output: OutFile[];

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-manifest-shape-'));
  mkdirSync(join(root, 'routes', 'blog'), { recursive: true });
  mkdirSync(join(root, 'components'), { recursive: true });
  writeFileSync(join(root, 'components', 'site-nav.fud'), NAV);
  writeFileSync(join(root, 'routes', 'index.fud'), page('Home', '../'));
  writeFileSync(join(root, 'routes', 'about.fud'), page('About', '../'));
  writeFileSync(join(root, 'routes', 'blog', 'index.fud'), page('Blog', '../../'));
  writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: ['/fudic-main.js'] }));
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    build: { write: false, minify: false },
  })) as unknown as { output: OutFile[] };
  output = result.output;
}, 120000);

const file = (): ManifestFile => manifestFile(output);

describe('the published manifest', () => {
  it('criterion 7: contains no URL — not a chunk, not an endpoint, not a dep', () => {
    // A `/` may legitimately appear in `base`, in `csp` and in a route `pattern`. Nowhere
    // else, and least of all inside `deps`.
    for (const record of file().routes) {
      for (const dep of record.deps ?? []) {
        expect(dep).not.toContain('/');
        expect(dep).not.toMatch(/\.js$/u);
      }
      expect(record).not.toHaveProperty('chunk');
      expect(record).not.toHaveProperty('data');
      expect(record).not.toHaveProperty('esm');
      expect(record).not.toHaveProperty('html');
    }
  });

  it('states `base` once instead of baking it into every URL', () => {
    expect(file().base).toBe('/');
  });

  it('every derived render URL lands on a file the build wrote', () => {
    // The property the whole SDD rests on. Names in, real files out.
    const table = compileManifest(file());
    const derived = file()
      .routes.map((r) => table.urls.renderUrl(r))
      .filter((u): u is string => u !== null);
    expect(derived).toHaveLength(3);
    for (const url of derived) {
      expect(emitted(output, url)).toBe(true);
    }
  });

  it('every derived dep URL lands on a file the build wrote', () => {
    const table = compileManifest(file());
    const deps = new Set(file().routes.flatMap((r) => r.deps ?? []));
    expect(deps.size).toBeGreaterThan(0);
    for (const name of deps) {
      expect(emitted(output, table.urls.depUrl(name))).toBe(true);
    }
  });

  it('every derived hydration URL lands on a file the build wrote', () => {
    // `/h` costs the manifest zero bytes: it is the same `deps` list, another prefix.
    const table = compileManifest(file());
    const tags = new Set(file().routes.flatMap((r) => r.deps ?? []));
    for (const tag of tags) {
      expect(emitted(output, table.urls.hydrateUrl(tag))).toBe(true);
    }
  });

  it('criterion 11: three routes fit well inside the budget', () => {
    const bytes = Buffer.byteLength(
      String(output.find((o) => o.fileName === 'fudic-routes.json')!.source),
      'utf8',
    );
    // The CSP templates alone are ~250 B and do not grow with the route count, so the
    // budget is about what a ROUTE costs: names, not URLs.
    expect(bytes).toBeLessThanOrEqual(500);
  });
});
