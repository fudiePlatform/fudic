/**
 * BUG-31 §6 — the built chunks are actually described by their maps.
 *
 * Three bugs met here and every one of them left the build green. The compiler emitted zero
 * mappings for the author's `@code`; the three passes handed `transformWithOxc` the emit's
 * map beside code it had already rewritten, so the map named the right `.fud` and described a
 * text that no longer existed; and a `\0`-prefixed virtual id was dropped from the map
 * entirely by Vite 8, silently, with the `.map` served at 200.
 *
 * The measurement is the point. "The last mapped column reaches the end of the line" is not a
 * criterion: 62 segments over 5 593 columns pass it with the file essentially unmapped. What
 * is asserted here is DENSITY — segments per line of code — alongside the names, which is
 * what a debugger needs to resolve a binding at all.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';
import { decodeMappings } from './helpers/vlq.js';

const PAGE = `<!DOCTYPE html>
<html>
<head>
  <link rel="component" href="../components/app-counter.fud">
  <title>Home</title>
</head>
<body><h1>Home</h1><app-counter></app-counter></body>
</html>
`;

/** A component with a real `@client` zone: signals, a handler, and names worth resolving. */
const COUNTER = `@code {
  @client {
    import { signal } from '@fudic/core';

    const count = signal(0);
    const start = 0;
    const inc = () => count.set(count() + 1);
  }
}

<app-counter>
  <template shadowrootmode="open">
    <button @click=@inc()>@count()</button>
  </template>
</app-counter>
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
}

const textOf = (file: OutFile): string =>
  file.code ?? (typeof file.source === 'string' ? file.source : '');

const find = (files: OutFile[], name: string): OutFile | undefined =>
  files.find((o) => o.fileName === name);

const mapOf = (files: OutFile[], name: string): MapV3 =>
  JSON.parse(textOf(find(files, `${name}.map`)!)) as MapV3;

/** The hydration chunks of the build — `assets/h/*.js`, the maps excluded. */
const hydrationChunks = (files: OutFile[]): OutFile[] =>
  files.filter((o) => o.fileName.startsWith('assets/h/') && o.fileName.endsWith('.js'));


/**
 * Segments per non-empty line of the generated file.
 *
 * The metric that catches a map which is present, valid and empty. A chunk of a hundred
 * lines with four segments in it passes every "does it resolve" check and steps nowhere.
 */
function density(code: string, mappings: string): number {
  const lines = code.split('\n').filter((l) => l.trim() !== '').length;
  return decodeMappings(mappings).length / lines;
}

async function buildRoot(): Promise<OutFile[]> {
  const root = mkdtempSync(join(tmpdir(), 'fudic-density-'));
  mkdirSync(join(root, 'src', 'routes'), { recursive: true });
  mkdirSync(join(root, 'src', 'components'), { recursive: true });
  writeFileSync(join(root, 'src', 'routes', 'index.fud'), PAGE);
  writeFileSync(join(root, 'src', 'components', 'app-counter.fud'), COUNTER);
  // With a Service Worker, so the LINK pass runs and its chunks can be measured too.
  writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: [] }));
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    build: { write: false, minify: false, sourcemap: true },
  })) as unknown as { output: OutFile[] };
  return result.output;
}

describe('vite build — the hydration chunk is mapped, not merely accompanied', () => {
  let output: OutFile[];

  beforeAll(async () => {
    output = await buildRoot();
  }, 300000);

  it('there is a hydration chunk, and it has a map', () => {
    const chunks = hydrationChunks(output);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) expect(find(output, `${chunk.fileName}.map`)).toBeDefined();
  });

  it('its `mappings` is not empty — which is exactly what it used to be', () => {
    for (const chunk of hydrationChunks(output)) {
      expect(mapOf(output, chunk.fileName).mappings).not.toBe('');
    }
  });

  it('it carries NAMES, without which the console resolves against the minified scope', () => {
    const names = hydrationChunks(output).flatMap((c) => mapOf(output, c.fileName).names);
    expect(names.length).toBeGreaterThan(0);
    // The author's own bindings, not the emit's scaffolding.
    for (const name of ['count', 'inc', 'signal']) expect(names).toContain(name);
  });

  it('and the names are not an artifact of the runtime it imports: the `.fud` is a source', () => {
    const chunk = hydrationChunks(output)[0]!;
    const map = mapOf(output, chunk.fileName);
    expect(map.sources.some((s) => (s ?? '').endsWith('.fud?client'))).toBe(true);
  });

  it('the runtime it bundles maps back to its `.ts`, not to the `dist/*.js` it was read from', () => {
    // `loadWithSourceMap` end to end: the built packages ship a `.js.map` that Rolldown does
    // not go looking for on its own, so without the `load` hook the chain stopped at the
    // compiled JavaScript and the debugger showed `signal.js` with the types erased.
    const sources = hydrationChunks(output)
      .flatMap((c) => mapOf(output, c.fileName).sources)
      .map((s) => (s ?? '').replace(/\\/gu, '/'));
    expect(sources.some((s) => s.includes('/core/src/') && s.endsWith('.ts'))).toBe(true);
    expect(sources.every((s) => !s.endsWith('dist.js'))).toBe(true);
  });

  it('and carries that `.ts` TEXT, which `tsc` left out of the map it wrote', () => {
    // `sourceMap` without `inlineSources`: the map names `../src/signal.ts` and carries none
    // of it. Chaining it as it stands moves the problem — the debugger then asks for a `.ts`
    // at a URL nothing publishes and shows an empty pane.
    const chunk = hydrationChunks(output)[0]!;
    const map = mapOf(output, chunk.fileName) as MapV3 & {
      sourcesContent?: readonly (string | null)[];
    };
    const i = map.sources.findIndex((s) => (s ?? '').replace(/\\/gu, '/').includes('/core/src/'));
    expect(i).toBeGreaterThan(-1);
    expect(map.sourcesContent?.[i]).toContain('export');
  });

  it('a virtual id reaches the map at all — no `\\0` prefix anywhere (BUG-31)', () => {
    // Vite 8 / Rolldown DROPS a `\0`-prefixed module from the map: it never enters `sources`
    // and its segments are gone, silently, with the build green and the `.map` served at 200.
    // The main-thread entry is a virtual module, so its own id has to be in there.
    const main = output.find((o) => o.fileName.startsWith('fudic-main-') && o.fileName.endsWith('.js'))!;
    const sources = mapOf(output, main.fileName).sources.map((s) => (s ?? '').replace(/\\/gu, '/'));
    expect(sources.some((s) => s.endsWith('fudic-main'))).toBe(true);
    for (const file of output) {
      if (!file.fileName.endsWith('.map')) continue;
      expect(textOf(file)).not.toContain('\\u0000');
      expect(textOf(file)).not.toContain('\0');
    }
  });

  it('DENSITY: more than one segment per line of generated code', () => {
    // The assertion the "last mapped column" check cannot make. A file mapped at both ends
    // and nowhere in between passes that one and steps nowhere.
    for (const chunk of hydrationChunks(output)) {
      const map = mapOf(output, chunk.fileName);
      expect(density(textOf(chunk), map.mappings)).toBeGreaterThan(1);
    }
  });

  it('every mapped position is inside the code that was emitted', () => {
    for (const chunk of hydrationChunks(output)) {
      const lines = textOf(chunk).split('\n');
      for (const m of decodeMappings(mapOf(output, chunk.fileName).mappings)) {
        expect(m.generatedLine).toBeLessThan(lines.length);
        expect(m.generatedColumn).toBeLessThanOrEqual(lines[m.generatedLine]!.length);
      }
    }
  });

  it('the LINK chunks are dense too, which is what `inMap` bought', () => {
    // The three passes used to return the emit's `.fud` map beside code Oxc had already
    // stripped: a map that resolves, names the right file, and describes a text that no
    // longer exists. These chunks came out with a handful of mappings each, or none.
    const chunks = output.filter((o) => o.fileName.startsWith('sw/c/') && o.fileName.endsWith('.js'));
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      const map = mapOf(output, chunk.fileName);
      expect(map.mappings).not.toBe('');
      expect(density(textOf(chunk), map.mappings)).toBeGreaterThan(1);
    }
  });

  it('the mapping reaches the END of the chunk, not only its first lines', () => {
    // Necessary and NOT sufficient — it is here beside the density, never instead of it.
    for (const chunk of hydrationChunks(output)) {
      const positions = decodeMappings(mapOf(output, chunk.fileName).mappings);
      const lastLine = Math.max(...positions.map((p) => p.generatedLine));
      const total = textOf(chunk).split('\n').length;
      expect(lastLine).toBeGreaterThan(total / 2);
    }
  });
});
