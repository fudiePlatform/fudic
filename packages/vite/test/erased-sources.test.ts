/**
 * BUG-47 §4.2 — a module the erasure changed does not carry its text in a published map.
 *
 * `ErasedModules` on its own: what `erase` records, and how `blank` matches a map's `sources`
 * against it — by absolute path, from the map's own directory.
 */

import { describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { ErasedModules } from '../src/erased-sources.js';

const HALVES = "import { middleware } from '@fudic/http';\nexport const a = middleware().server(SECRET);";
const VALIDATOR = "import { serverValidator } from '@fudic/forms';\nexport const v = serverValidator(CHECK);";

const OUT = resolve('/repo/app/dist');
const AUTH = resolve('/repo/app/src/auth.ts');
const PLAIN = resolve('/repo/app/src/plain.ts');

/** A map at `dist/assets/x.js.map` naming `sources` relative to it, with these contents. */
const mapOf = (sources: readonly string[], sourcesContent?: readonly (string | null)[]): string =>
  JSON.stringify({ version: 3, sources, ...(sourcesContent === undefined ? {} : { sourcesContent }), mappings: '' });

describe('ErasedModules.erase', () => {
  it('erases the .server(…) halves and remembers the module', () => {
    const erased = new ErasedModules();
    expect(erased.erase(HALVES, AUTH)).toContain('.server(undefined)');
    const map = mapOf(['../../src/auth.ts'], ['SECRET']);
    expect(JSON.parse(erased.blank(map, 'assets/x.js.map', OUT)).sourcesContent).toEqual([null]);
  });

  it('erases the serverValidator bodies too', () => {
    expect(new ErasedModules().erase(VALIDATOR, AUTH)).toContain('serverValidator(() => null)');
  });

  it('chains both erasures in one module', () => {
    const out = new ErasedModules().erase(`${VALIDATOR}\n${HALVES.split('\n')[1]}\nimport { middleware } from '@fudic/http';`, AUTH);
    expect(out).toContain('serverValidator(() => null)');
    expect(out).toContain('.server(undefined)');
  });

  it('a module with nothing to erase is null, and is not remembered', () => {
    const erased = new ErasedModules();
    expect(erased.erase('export const a = 1;', PLAIN)).toBeNull();
    const map = mapOf(['../../src/plain.ts'], ['export const a = 1;']);
    expect(erased.blank(map, 'assets/x.js.map', OUT)).toBe(map);
  });
});

describe('ErasedModules.blank', () => {
  const erased = new ErasedModules();
  erased.erase(HALVES, AUTH);

  it('nulls the erased module, keeps its `sources` entry and every other text', () => {
    const map = mapOf(['../../src/auth.ts', '../../src/plain.ts'], ['SECRET', 'plain']);
    const out = JSON.parse(erased.blank(map, 'assets/x.js.map', OUT)) as { sources: string[]; sourcesContent: unknown[] };
    expect(out.sources).toEqual(['../../src/auth.ts', '../../src/plain.ts']);
    expect(out.sourcesContent).toEqual([null, 'plain']);
  });

  it('matches by absolute path: the same module from another depth', () => {
    const map = mapOf(['../../../src/auth.ts'], ['SECRET']);
    expect(JSON.parse(erased.blank(map, 'sw/c/x.js.map', OUT)).sourcesContent).toEqual([null]);
    // The same relative text from a map one level up names another file: left alone.
    expect(erased.blank(map, 'assets/x.js.map', OUT)).toBe(map);
  });

  it('a Windows spelling of the recorded path is the same module', () => {
    const windows = new ErasedModules();
    windows.erase(HALVES, AUTH.replace(/\//gu, '\\'));
    const map = mapOf([join('..', '..', 'src', 'auth.ts')], ['SECRET']);
    expect(JSON.parse(windows.blank(map, 'assets/x.js.map', OUT)).sourcesContent).toEqual([null]);
  });

  it('the same string when nothing changes: no texts, an entry already null, no sources', () => {
    for (const map of [
      mapOf(['../../src/auth.ts']),
      mapOf(['../../src/auth.ts'], [null]),
      JSON.stringify({ version: 3, mappings: '' }),
    ]) {
      expect(erased.blank(map, 'assets/x.js.map', OUT)).toBe(map);
    }
  });

  it('with nothing erased, the map is not even parsed', () => {
    expect(new ErasedModules().blank('not json', 'assets/x.js.map', OUT)).toBe('not json');
  });
});
