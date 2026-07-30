/**
 * SDD-19 §6.17 (hito): a real `vite build` over the four fixtures produces the route
 * manifest, a per-route chunk in both formats, and the SW/main bootstraps — the plugin as a
 * whole, exercised by Vite itself (never parsing `.fud`, only bundling the emit).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fudic } from '../src/index.js';
import { BUILD_TOKEN } from '../src/constants.js';

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
  // home's `@server load` imports its data source `./db`; stub it so the ?server module
  // resolves (home stays incremental — hasLoad ⇒ dynamic:true — so it is not prerendered).
  writeFileSync(join(routes, 'db.ts'), 'export const db = { query: async () => [] };\n');
  // With a `sw.json` the build also emits the Service Worker and the linkable chunks.
  writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: ['/style.css'] }));
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
    const manifest = JSON.parse(asset!.source as string) as {
      build: string;
      csp: { document: string; sw: string };
      routes: Array<Record<string, unknown>>;
    };
    // home.fud → /home (only index.fud maps to /); the components are not routes.
    expect(manifest.routes).toHaveLength(1);
    expect(manifest.build).toMatch(/^[0-9a-f]{8}$/u);
    expect(manifest.csp.document).toContain('{nonce}');
    // `home` has `@server load`, so its data is not build-known: rendered in the SW.
    expect(manifest.routes[0]).toMatchObject({ pattern: '/home', mode: 'sw' });
    expect(manifest.routes[0]!['chunk']).toMatch(/\/sw\/c\/home-.*\.js$/u);
    expect(manifest.routes[0]!['data']).toBe('/_fudic/data/home');
  });

  it('emits a per-route RenderChunk', () => {
    const wrapper = chunks().find((o) => o.fileName.includes('c/') || o.fileName.includes('c-'));
    expect(wrapper).toBeDefined();
  });

  it('emits the two bootstraps, and no Web Worker one', () => {
    expect(named('fudic-main')).toBe(true);
    expect(named('fudic-sw')).toBe(true);
    expect(named('fudic-ww')).toBe(false);
  });

  it('emits a linkable chunk in exports/require form, with the build id inlined', () => {
    const linked = output.find((o) => o.fileName.startsWith('sw/c/home'));
    expect(linked).toBeDefined();
    const code = (linked!.source ?? linked!.code ?? '') as string;
    // The exact shape the linker's `new Function('exports','require','module')` runs.
    expect(code).toMatch(/exports\.render\s*=/u);
    expect(code).toMatch(/require\(["']@fudic\/ssr["']\)/u);
    // BUG-03: the SW is now an ASSET of this output — its own bundle, emitted whole —
    // and the build id was substituted into its code before emitting.
    const sw = output.find((o) => o.fileName === 'fudic-sw.js');
    expect(sw!.type).toBe('asset');
    expect(sw!.source).not.toContain(BUILD_TOKEN);
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
