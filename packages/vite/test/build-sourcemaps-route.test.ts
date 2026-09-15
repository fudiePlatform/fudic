/**
 * SDD-39 §6.6 — the chunk of a ROUTE is described by its map, and by ONE source.
 *
 * The half of a page that had no chunk at all until this SDD has to be as debuggable as a
 * component's: a breakpoint on a line of `@client` lands, and the names resolve. And it has
 * to stay at one `sources` entry — the route's own `.fud` — even though the walk crosses the
 * layout's markup, because crossing it is calls to the cursor and never a slice of its text
 * (SDD-13 §4.3).
 *
 * Its own build root, on purpose: what a chunk ends up holding depends on how the bundler
 * split the graph, so measuring a route inside the fixture of `build-sourcemaps-density`
 * would move that suite's numbers without anything being wrong with either.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';
import { decodeMappings } from './helpers/vlq.js';

const LAYOUT = `<!DOCTYPE html>
<html>
<head>@RenderHead()</head>
<body>
  <header class="shell"><p>una cabecera del layout</p></header>
  <main>@RenderBody()</main>
  <footer class="shell"><p>un pie del layout</p></footer>
</body>
</html>
`;

const ROUTE = `<link rel="layout" href="../layouts/_layout.fud">

@code {
  @client {
    import { signal } from '@fudic/core';

    const veces = signal(0);
    const sube = () => veces.set(veces() + 1);
  }
}

<button class="sube" @click=@sube()>suma</button>
<output>@veces()</output>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
}

interface MapV3 {
  readonly version: number;
  readonly sources: readonly (string | null)[];
  readonly names: readonly string[];
  readonly mappings: string;
  readonly sourcesContent?: readonly (string | null)[];
}

const textOf = (file: OutFile): string =>
  file.code ?? (typeof file.source === 'string' ? file.source : '');

const mapOf = (files: OutFile[], name: string): MapV3 =>
  JSON.parse(textOf(files.find((o) => o.fileName === `${name}.map`)!)) as MapV3;

async function buildRoot(): Promise<OutFile[]> {
  const root = mkdtempSync(join(tmpdir(), 'fudic-routemap-'));
  mkdirSync(join(root, 'src', 'routes'), { recursive: true });
  mkdirSync(join(root, 'src', 'layouts'), { recursive: true });
  writeFileSync(join(root, 'src', 'layouts', '_layout.fud'), LAYOUT);
  writeFileSync(join(root, 'src', 'routes', 'reactiva.fud'), ROUTE);
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    build: { write: false, minify: false, sourcemap: true },
  })) as unknown as { output: OutFile[] };
  return result.output;
}

describe('the chunk of a route, and its map', () => {
  let output: OutFile[];
  let chunk: OutFile;
  let map: MapV3;

  beforeAll(async () => {
    output = await buildRoot();
    chunk = output.find(
      (o) => o.fileName.startsWith('assets/h/reactiva-') && o.fileName.endsWith('.js'),
    )!;
    map = mapOf(output, chunk.fileName);
  }, 300000);

  it('exists at all — `assets/h/<safeName>`, beside the component chunks (§6.14)', () => {
    expect(chunk).toBeDefined();
    // A default export and not a `customElements.define`: a route is not a tag (§3.4).
    expect(textOf(chunk)).toMatch(/\bas default\b/u);
    expect(textOf(chunk)).not.toContain('customElements.define');
  });

  it('has ONE `.fud` in `sources`, and it is the route (§6.6)', () => {
    const fud = map.sources.filter((s) => (s ?? '').endsWith('.fud?client'));
    expect(fud).toHaveLength(1);
    expect(fud[0]).toMatch(/reactiva\.fud\?client$/u);
    // Not a byte of the layout reached the output: crossing it is cursor calls.
    expect(textOf(chunk)).not.toContain('cabecera del layout');
    expect(map.sourcesContent?.every((c) => !(c ?? '').includes('@RenderBody'))).toBe(true);
  });

  it('carries the author’s own names, which is what a breakpoint resolves against', () => {
    for (const name of ['veces', 'sube', 'signal']) expect(map.names).toContain(name);
  });

  it('maps every statement of `@client` back to the line it was written on', () => {
    const i = map.sources.findIndex((s) => (s ?? '').endsWith('reactiva.fud?client'));
    const source = map.sourcesContent![i]!.split('\n');
    const mapped = new Set(
      decodeMappings(map.mappings)
        .filter((m) => m.sourceIndex === i)
        .map((m) => m.sourceLine),
    );
    // Located in the `.fud` rather than counted: what is asserted is that the line the author
    // can set a breakpoint on is a line the map knows.
    for (const needle of ['const veces =', 'const sube =']) {
      const line = source.findIndex((l) => l.includes(needle));
      expect(line).toBeGreaterThan(-1);
      expect(mapped).toContain(line);
    }
  });

  it('and the interpolation of the markup maps back to the line that wrote it', () => {
    // The value writes are anchored, which is what puts a breakpoint on a repaint. An event
    // BINDING is not, here or in a component's chunk — the listener line is the emit's, and
    // the handler it names is `@code`, which is mapped above.
    const i = map.sources.findIndex((s) => (s ?? '').endsWith('reactiva.fud?client'));
    const source = map.sourcesContent![i]!.split('\n');
    const mapped = new Set(
      decodeMappings(map.mappings)
        .filter((m) => m.sourceIndex === i)
        .map((m) => m.sourceLine),
    );
    expect(mapped).toContain(source.findIndex((l) => l.includes('@veces()')));
  });
});
