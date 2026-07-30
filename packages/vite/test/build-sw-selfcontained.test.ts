/**
 * BUG-03: one realm, one bundle. `fudic-sw.js` used to be a chunk of the SAME Rollup
 * output as `fudic-main.js`, so code splitting handed them a shared chunk under
 * `/assets/`. Two loaders for one URL, and neither knows about the other: the page gets
 * it from the SW's cache while the worker's own script loader fetches it from the
 * network, bypassing both the fetch handler and the HTTP cache.
 *
 * The check is static and it is the one that stops the regression: the emitted Service
 * Worker has no imports at all.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
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
<body><h1>Home</h1></body>
</html>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
}

/** Every module specifier a file references — static or dynamic. */
function specifiersOf(code: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu, // dynamic import
    /\bfrom\s*["']([^"']+)["']/gu, // import … from / export … from
    /\bimport\s*["']([^"']+)["']/gu, // bare side-effect import
  ];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) {
      found.push(match[1]!);
    }
  }
  return found;
}

const textOf = (file: OutFile): string =>
  file.code ?? (typeof file.source === 'string' ? file.source : '');

/** A project root: one route, and a `sw.json` unless told otherwise. */
function projectRoot(options: { serviceWorker: boolean; shell?: readonly string[] }): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-swself-'));
  mkdirSync(join(root, 'routes'), { recursive: true });
  mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(join(root, 'routes', 'index.fud'), PAGE);
  writeFileSync(join(root, 'public', 'logo.svg'), '<svg/>');
  if (options.serviceWorker) {
    writeFileSync(
      join(root, 'sw.json'),
      JSON.stringify({ shell: options.shell ?? ['/fudic-main.js'] }),
    );
  }
  return root;
}

async function buildRoot(root: string, options: { base?: string } = {}): Promise<OutFile[]> {
  const result = (await build({
    root,
    ...(options.base === undefined ? {} : { base: options.base }),
    logLevel: 'silent',
    resolve: { alias: { '@fudic/ssr': ssrDist, '@fudic/transport': transportDist } },
    plugins: [fudic()],
    build: { write: false, minify: false },
  })) as unknown as { output: OutFile[] };
  return result.output;
}

const idOf = (files: OutFile[]): string =>
  (
    JSON.parse(files.find((o) => o.fileName === 'fudic-routes.json')!.source as string) as {
      build: string;
    }
  ).build;

describe('vite build — the Service Worker is a self-contained bundle', () => {
  let output: OutFile[];
  let root: string;
  let sw: OutFile;
  let main: OutFile;

  beforeAll(async () => {
    root = projectRoot({ serviceWorker: true });
    output = await buildRoot(root);
    sw = output.find((o) => o.fileName === 'fudic-sw.js')!;
    main = output.find((o) => o.fileName === 'fudic-main.js')!;
  }, 180000);

  it('§6.3 exists at the root of outDir, under that exact name, without a hash', () => {
    expect(sw).toBeDefined();
    expect(main).toBeDefined();
  });

  it('§6.1 has no imports at all — not one static, not one dynamic', () => {
    expect(specifiersOf(textOf(sw))).toEqual([]);
  });

  it('§6.2 shares no file with the main thread: the intersection is empty', () => {
    const mainSpecs = new Set(specifiersOf(textOf(main)));
    const shared = specifiersOf(textOf(sw)).filter((s) => mainSpecs.has(s));
    expect(shared).toEqual([]);
  });

  it('§6.1 bundles the runtime INSIDE: the linker builtin is a local binding', () => {
    const code = textOf(sw);
    expect(code).toContain('createRouter');
    // The whole point of the builtin: `@fudic/ssr` lives in the worker, not per chunk.
    expect(code).not.toMatch(/from\s*["']@fudic\//u);
  });

  it('§6.4 no emitted artifact keeps the build token, and the SW carries the real id', () => {
    for (const file of output) {
      expect(textOf(file)).not.toContain('__FUDIC_BUILD__');
    }
    // The same id the manifest declares: they name the same caches.
    const id = idOf(output);
    expect(id).toMatch(/^[0-9a-f]{8}$/u);
    expect(textOf(sw)).toContain(`"${id}"`);
  });

  it('§6.6 the main thread registers it by literal URL, with `base` applied', async () => {
    expect(textOf(main)).toContain('"/fudic-sw.js"');
    const based = await buildRoot(projectRoot({ serviceWorker: true }), { base: '/app/' });
    const basedMain = based.find((o) => o.fileName === 'fudic-main.js')!;
    expect(textOf(basedMain)).toContain('"/app/fudic-sw.js"');
  }, 180000);

  it('§6.7 the link pass still emits its chunks and the manifest still points at them', () => {
    const manifest = JSON.parse(
      output.find((o) => o.fileName === 'fudic-routes.json')!.source as string,
    ) as { routes: Array<Record<string, unknown>> };
    const chunk = manifest.routes[0]!['chunk'] as string;
    expect(chunk).toMatch(/^\/sw\/c\/index-.*\.js$/u);
    expect(output.some((o) => `/${o.fileName}` === chunk)).toBe(true);
  });

  it('§6.5 rebuilding the SAME tree produces the same build id', async () => {
    expect(idOf(await buildRoot(root))).toBe(idOf(output));
  }, 180000);

  it('§6.5 the id changes when the Service Worker code changes', async () => {
    // A different `shell` changes the worker's own bytes and nothing else. The SW is no
    // longer split into hashed `/assets/` chunks, so if the id were derived from file
    // NAMES it would not move — the browser would never update and `activate` would
    // never purge. That is the trap of BUG-03 §2.2.
    const other = projectRoot({ serviceWorker: true, shell: ['/fudic-main.js', '/logo.svg'] });
    expect(idOf(await buildRoot(other))).not.toBe(idOf(output));
  }, 180000);

  it('§6.8 without sw.json there is no Service Worker and no SW build', async () => {
    const plain = await buildRoot(projectRoot({ serviceWorker: false }));
    expect(plain.some((o) => o.fileName === 'fudic-sw.js')).toBe(false);
  }, 180000);
});
