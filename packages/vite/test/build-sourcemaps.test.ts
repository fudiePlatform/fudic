/**
 * BUG-05: the two NESTED builds — the Service Worker's own bundle and the link pass —
 * emit no source map, whatever the host is configured to do. They run with
 * `configFile: false`, so nothing is inherited, and their result types had no field for
 * a map even if one had been produced.
 *
 * The criterion that matters is §6.3: a map that merely EXISTS is not the fix. The link
 * pass discarded the compiler's `.fud` map (`link.ts:95` returned `{ code }` alone), so
 * turning `sourcemap` on without that would chain back to the generated JS — valid, and
 * useless.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fudic } from '../src/index.js';
import { BUILD_TOKEN } from '../src/constants.js';
import { decodeMappings } from './helpers/vlq.js';

const ssrDist = fileURLToPath(new URL('../../ssr/dist/index.js', import.meta.url));
const transportDist = fileURLToPath(new URL('../../transport/dist/index.js', import.meta.url));

const PAGE = `<!DOCTYPE html>
<html>
<head>
  <link rel="component" href="../components/app-badge.fud">
  <title>Home</title>
</head>
<body><h1>Home</h1><app-badge>ok</app-badge></body>
</html>
`;

const BADGE = `<head>
  <style>.badge { border: 1px solid #ccc; }</style>
</head>

<app-badge>
  <template shadowrootmode="open">
    <span class="badge"><slot></slot></span>
  </template>
</app-badge>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
}

interface SourceMapV3Like {
  readonly version: number;
  readonly sources: readonly (string | null)[];
  readonly mappings: string;
}

const textOf = (file: OutFile): string =>
  file.code ?? (typeof file.source === 'string' ? file.source : '');

const find = (files: OutFile[], name: string): OutFile | undefined =>
  files.find((o) => o.fileName === name);

const mapOf = (files: OutFile[], name: string): SourceMapV3Like =>
  JSON.parse(textOf(find(files, `${name}.map`)!)) as SourceMapV3Like;

function projectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-swmap-'));
  mkdirSync(join(root, 'routes'), { recursive: true });
  mkdirSync(join(root, 'components'), { recursive: true });
  writeFileSync(join(root, 'routes', 'index.fud'), PAGE);
  writeFileSync(join(root, 'components', 'app-badge.fud'), BADGE);
  writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: ['/fudic-main.js'] }));
  return root;
}

async function buildRoot(
  root: string,
  sourcemap: boolean | 'inline' | 'hidden',
): Promise<OutFile[]> {
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { '@fudic/ssr': ssrDist, '@fudic/transport': transportDist } },
    plugins: [fudic()],
    build: { write: false, minify: false, sourcemap },
  })) as unknown as { output: OutFile[] };
  return result.output;
}

/** Every `sw/c/*.js` of an output, excluding the maps themselves. */
const linkChunks = (files: OutFile[]): OutFile[] =>
  files.filter((o) => o.fileName.startsWith('sw/c/') && o.fileName.endsWith('.js'));

describe('vite build — the nested builds emit their source maps', () => {
  let output: OutFile[];

  beforeAll(async () => {
    output = await buildRoot(projectRoot(), true);
  }, 300000);

  it('§6.1 the Service Worker has a sibling `.map` and points at it', () => {
    expect(find(output, 'fudic-sw.js.map')).toBeDefined();
    expect(textOf(find(output, 'fudic-sw.js')!).trimEnd()).toMatch(
      /\/\/# sourceMappingURL=fudic-sw\.js\.map$/u,
    );
    expect(mapOf(output, 'fudic-sw.js').version).toBe(3);
  });

  it('§6.2 every linkable chunk has a sibling `.map` and points at it', () => {
    const chunks = linkChunks(output);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      const name = chunk.fileName.slice(chunk.fileName.lastIndexOf('/') + 1);
      expect(find(output, `${chunk.fileName}.map`)).toBeDefined();
      expect(textOf(chunk).trimEnd()).toMatch(
        new RegExp(`//# sourceMappingURL=${name}\\.map$`, 'u'),
      );
    }
  });

  it('§6.3 a linkable chunk maps back to the `.fud`, not to the generated JS', () => {
    // The one criterion that separates a useful map from a merely present one. Every
    // chunk of the link pass comes from a `.fud`, through `transformFud`.
    const sources = linkChunks(output).flatMap((c) => mapOf(output, c.fileName).sources);
    expect(sources.some((s) => (s ?? '').endsWith('.fud'))).toBe(true);
  });

  it('§6.4 the Service Worker map reaches the runtime it bundles', () => {
    const sources = mapOf(output, 'fudic-sw.js').sources.map((s) => (s ?? '').replace(/\\/gu, '/'));
    expect(sources.some((s) => s.includes('/transport/'))).toBe(true);
  });

  it('§6.7 the map is consistent with the code that was actually emitted', () => {
    // The trap of §2.4: `BUILD_TOKEN` is substituted AFTER the nested build, so a token
    // and an id of different lengths shift every column that follows. The invariant that
    // makes the map correct by construction is that they measure the same.
    const code = textOf(find(output, 'fudic-sw.js')!);
    const lines = code.split('\n');
    for (const m of decodeMappings(mapOf(output, 'fudic-sw.js').mappings)) {
      expect(m.generatedLine).toBeLessThan(lines.length);
      expect(m.generatedColumn).toBeLessThanOrEqual(lines[m.generatedLine]!.length);
    }
  });

  it('§6.7 the build id and the token measure the same, so substituting moves nothing', () => {
    const manifest = JSON.parse(textOf(find(output, 'fudic-routes.json')!)) as { build: string };
    expect(manifest.build).toHaveLength(BUILD_TOKEN.length);
  });
});

describe('vite build — sourcemap is the host’s decision', () => {
  it('§6.5 the default emits no map and no comment', async () => {
    const output = await buildRoot(projectRoot(), false);
    expect(output.some((o) => o.fileName.endsWith('.map'))).toBe(false);
    for (const file of [find(output, 'fudic-sw.js')!, ...linkChunks(output)]) {
      expect(textOf(file)).not.toContain('sourceMappingURL');
    }
  }, 300000);

  it('§6.6 `hidden` emits the map and NOT the comment', async () => {
    const output = await buildRoot(projectRoot(), 'hidden');
    expect(find(output, 'fudic-sw.js.map')).toBeDefined();
    expect(textOf(find(output, 'fudic-sw.js')!)).not.toContain('sourceMappingURL');
  }, 300000);

  it('§6.6 `inline` emits the data URI and NO map file', async () => {
    const output = await buildRoot(projectRoot(), 'inline');
    expect(find(output, 'fudic-sw.js.map')).toBeUndefined();
    expect(textOf(find(output, 'fudic-sw.js')!)).toContain(
      'sourceMappingURL=data:application/json;',
    );
  }, 300000);
});
