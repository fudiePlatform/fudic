/**
 * SDD-19 §6.17 (hito): a real `vite build` over the four fixtures produces the route
 * manifest, a per-route RenderChunk, and the SW/WW/main bootstraps — the plugin as a
 * whole, exercised by Vite itself (never parsing `.fud`, only bundling the emit).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fudic } from '../src/index.js';

const fixtures = fileURLToPath(new URL('../../compiler/fixtures', import.meta.url));
const ssrDist = fileURLToPath(new URL('../../ssr/dist/index.js', import.meta.url));
const transportDist = fileURLToPath(new URL('../../transport/dist/index.js', import.meta.url));

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string;
}

let output: OutFile[];

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-vite-'));
  const routes = join(root, 'routes');
  mkdirSync(routes, { recursive: true });
  for (const f of ['home.fud', 'app-card.fud', 'app-button.fud', 'app-badge.fud']) {
    writeFileSync(join(routes, f), readFileSync(join(fixtures, f), 'utf8'));
  }
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { '@fudic/ssr': ssrDist, '@fudic/transport': transportDist } },
    plugins: [fudic()],
    build: { write: false, minify: false },
  })) as unknown as { output: OutFile[] };
  output = result.output;
}, 120000);

const chunks = (): OutFile[] => output.filter((o) => o.type === 'chunk');
const named = (part: string): boolean => output.some((o) => o.fileName.includes(part));

describe('vite build over the fixtures (hito §6.17)', () => {
  it('emits the route manifest at a fixed path with the home route', () => {
    const asset = output.find((o) => o.type === 'asset' && o.fileName === 'fudic-routes.json');
    expect(asset).toBeDefined();
    const manifest = JSON.parse(asset!.source as string) as Array<Record<string, unknown>>;
    // home.fud → /home (only index.fud maps to /); the components are not routes.
    expect(manifest).toHaveLength(1);
    expect(manifest[0]).toMatchObject({ pattern: '/home', dynamic: true });
    expect(manifest[0]!['chunk']).toMatch(/\/assets\/c\/home-.*\.js$/u);
  });

  it('emits a per-route RenderChunk', () => {
    const wrapper = chunks().find((o) => o.fileName.includes('c/') || o.fileName.includes('c-'));
    expect(wrapper).toBeDefined();
  });

  it('emits the three-thread bootstraps (main, sw, ww)', () => {
    expect(named('fudic-main')).toBe(true);
    expect(named('fudic-sw')).toBe(true);
    expect(named('fudic-ww')).toBe(true);
  });

  it('bundles the streaming page (compiler emit, not Vite parsing .fud)', () => {
    const all = chunks()
      .map((c) => c.code ?? '')
      .join('\n');
    // The emitted page generator and the DSD composition survive into the bundle.
    expect(all).toContain('data-adopt');
    expect(all).toContain('shadowrootmode');
  });
});
