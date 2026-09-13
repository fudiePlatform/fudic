/**
 * BUG-31 — chaining the map a dependency already ships with.
 *
 * `@fudic/core` and the rest are consumed as their built `dist/*.js`, each ending in a
 * `sourceMappingURL` whose map points back at the `.ts` it was compiled from. Nobody was
 * reading them: Rolldown does not go looking for a module's own map, so the chain stopped at
 * the compiled JavaScript and the debugger showed `signal.js` — types erased — for a file
 * whose TypeScript was on disk two directories away.
 *
 * The second half is `sourcesContent`. `tsc` writes `sourceMap` without `inlineSources`, so
 * the map names `../src/signal.ts` and carries none of it; chaining it as it stands moves
 * the problem rather than solving it, and the debugger shows an empty pane instead of the
 * compiled JavaScript it used to show.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWithSourceMap } from '../src/inputmaps.js';

let root: string;

/** Write `text` at `rel` under the temp root and return its absolute path. */
function file(rel: string, text: string): string {
  const path = join(root, rel);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
  return path;
}

/** A `.js` with a sibling `.js.map` describing `sources`, and the `.ts` those name. */
function moduleWithMap(
  name: string,
  map: Record<string, unknown>,
  sources: Readonly<Record<string, string>> = {},
): string {
  const js = file(`dist/${name}`, 'export const x = 1;\n');
  file(`dist/${name}.map`, JSON.stringify(map));
  for (const [rel, text] of Object.entries(sources)) file(rel, text);
  return js;
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'fudic-inputmaps-'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('what it declines to touch', () => {
  it('an id carrying a query: that belongs to whoever coined it', () => {
    const js = moduleWithMap('q.js', { version: 3, sources: [] });
    expect(loadWithSourceMap(`${js}?client`)).toBeNull();
  });

  it('an id carrying a hash, for the same reason', () => {
    const js = moduleWithMap('h.js', { version: 3, sources: [] });
    expect(loadWithSourceMap(`${js}#frag`)).toBeNull();
  });

  it('anything that is not JavaScript', () => {
    const css = file('dist/style.css', 'a{}');
    file('dist/style.css.map', JSON.stringify({ version: 3, sources: [] }));
    expect(loadWithSourceMap(css)).toBeNull();
  });

  it('a file that is not there', () => {
    expect(loadWithSourceMap(join(root, 'dist', 'nope.js'))).toBeNull();
  });

  it('a JavaScript file with no map beside it — the common case', () => {
    const js = file('dist/plain.js', 'export const y = 2;\n');
    expect(loadWithSourceMap(js)).toBeNull();
  });

  it('a map that does not parse: a bad map is not a reason to fail a build', () => {
    const js = file('dist/broken.js', 'export const z = 3;\n');
    file('dist/broken.js.map', '{ this is not json');
    expect(loadWithSourceMap(js)).toBeNull();
  });
});

describe('what it takes: `.js`, `.mjs`, `.cjs`', () => {
  for (const ext of ['js', 'mjs', 'cjs']) {
    it(`handles a .${ext} with a sibling map`, () => {
      const js = moduleWithMap(`ext.${ext}`, { version: 3, sources: [] });
      expect(loadWithSourceMap(js)).not.toBeNull();
    });
  }
});

describe('what it hands back', () => {
  it('the module’s code, read from disk', () => {
    const js = moduleWithMap('code.js', { version: 3, sources: [] });
    expect(loadWithSourceMap(js)!.code).toBe('export const x = 1;\n');
  });

  it('the map as a STRING, which is the form `SourceMapInput` already accepts', () => {
    // As text and not as an object: `ExistingRawSourceMap | string | null` takes the string
    // as it stands, so this module needs no type from the bundler — and `@fudic/vite` no
    // dependency on rolldown that its `package.json` does not declare.
    const js = moduleWithMap('str.js', { version: 3, sources: [] });
    const loaded = loadWithSourceMap(js)!;
    expect(typeof loaded.map).toBe('string');
    expect(JSON.parse(loaded.map)).toMatchObject({ version: 3 });
  });
});

describe('sourcesContent — the `.ts` text travels with the map', () => {
  it('is read from disk, relative to the map', () => {
    const js = moduleWithMap(
      'one.js',
      { version: 3, sources: ['../src/one.ts'] },
      { 'src/one.ts': 'export const one: number = 1;\n' },
    );
    const map = JSON.parse(loadWithSourceMap(js)!.map) as { sourcesContent: (string | null)[] };
    expect(map.sourcesContent).toEqual(['export const one: number = 1;\n']);
  });

  it('does not overwrite an entry the map already carried', () => {
    const js = moduleWithMap(
      'kept.js',
      {
        version: 3,
        sources: ['../src/kept.ts'],
        sourcesContent: ['// the map said so'],
      },
      { 'src/kept.ts': '// the disk says otherwise' },
    );
    const map = JSON.parse(loadWithSourceMap(js)!.map) as { sourcesContent: (string | null)[] };
    expect(map.sourcesContent).toEqual(['// the map said so']);
  });

  it('fills in only the entries that are missing, keeping the ones that are not', () => {
    const js = moduleWithMap(
      'mixed.js',
      {
        version: 3,
        sources: ['../src/a.ts', '../src/b.ts'],
        sourcesContent: ['// inline a'],
      },
      { 'src/a.ts': '// disk a', 'src/b.ts': '// disk b' },
    );
    const map = JSON.parse(loadWithSourceMap(js)!.map) as { sourcesContent: (string | null)[] };
    expect(map.sourcesContent).toEqual(['// inline a', '// disk b']);
  });

  it('replaces an explicit `null`, which is the v3 spelling of "not available"', () => {
    const js = moduleWithMap(
      'nulled.js',
      { version: 3, sources: ['../src/n.ts'], sourcesContent: [null] },
      { 'src/n.ts': '// found after all' },
    );
    const map = JSON.parse(loadWithSourceMap(js)!.map) as { sourcesContent: (string | null)[] };
    expect(map.sourcesContent).toEqual(['// found after all']);
  });

  it('leaves `null` where the source is not on disk, rather than failing', () => {
    const js = moduleWithMap('gone.js', { version: 3, sources: ['../src/gone.ts'] });
    const map = JSON.parse(loadWithSourceMap(js)!.map) as { sourcesContent: (string | null)[] };
    expect(map.sourcesContent).toEqual([null]);
  });

  it('leaves `null` for a null entry in `sources` itself', () => {
    const js = moduleWithMap('nullsrc.js', { version: 3, sources: [null] });
    const map = JSON.parse(loadWithSourceMap(js)!.map) as { sourcesContent: (string | null)[] };
    expect(map.sourcesContent).toEqual([null]);
  });

  it('touches nothing when the map names no sources at all', () => {
    const js = moduleWithMap('nosources.js', { version: 3, mappings: '' });
    const map = JSON.parse(loadWithSourceMap(js)!.map) as Record<string, unknown>;
    expect('sourcesContent' in map).toBe(false);
  });

  it('keeps every other field of the map untouched', () => {
    const js = moduleWithMap('fields.js', {
      version: 3,
      file: 'one.js',
      names: ['x'],
      mappings: 'AAAA',
      sources: [],
    });
    expect(JSON.parse(loadWithSourceMap(js)!.map)).toMatchObject({
      version: 3,
      file: 'one.js',
      names: ['x'],
      mappings: 'AAAA',
    });
  });
});
