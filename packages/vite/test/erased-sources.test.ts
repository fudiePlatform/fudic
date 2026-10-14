/**
 * BUG-47 §4.2 and §4.6 — the erasure of server code from everything a browser receives.
 *
 * `ClientErasure` on its own: `erase` with the package of the file deciding whether the
 * `@fudic/http` mark is needed, and `blank` passing every JS/TS source of a map through the
 * same erasure — blanked, with its lines kept, never `null`. And `nodePackageOf` over a real
 * temporary tree.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { ClientErasure, nodePackageOf } from '../src/erased-sources.js';

const HALVES = "import { middleware } from '@fudic/http';\nexport const a = middleware().server(SECRET_HALF);";
const VALIDATOR = "import { serverValidator } from '@fudic/forms';\nexport const v = serverValidator(SECRET_CHECK);";
/** `csrf`'s shape: `middleware` by a relative path, so no `@fudic/http` mark. */
const CSRF = "import { middleware } from './middleware.js';\nexport const csrf = middleware()\n  .server((ctx) => {\n    check('sec-fetch-site');\n  });";

const OUT = resolve('/repo/app/dist');

/** Every file is the app's, except those under a `/http/` directory, which are `@fudic/http`'s. */
const packageOf = (file: string): string | undefined => (file.replace(/\\/gu, '/').includes('/http/') ? '@fudic/http' : 'app');

/** A map at `dist/assets/x.js.map` with these `sources` and, when given, their texts. */
const mapOf = (sources: readonly string[], sourcesContent?: readonly (string | null)[]): string =>
  JSON.stringify({ version: 3, sources, ...(sourcesContent === undefined ? {} : { sourcesContent }), mappings: '' });

const contentsOf = (map: string): readonly (string | null)[] =>
  (JSON.parse(map) as { sourcesContent: (string | null)[] }).sourcesContent;

describe('ClientErasure.erase', () => {
  const erasure = new ClientErasure(packageOf);

  it('erases the .server(…) halves of a module that imports @fudic/http', () => {
    const out = erasure.erase(HALVES, '/repo/app/src/auth.ts')!;
    expect(out).toContain('.server(undefined');
    expect(out).not.toContain('SECRET_HALF');
  });

  it('erases the serverValidator bodies, and both in one module', () => {
    expect(erasure.erase(VALIDATOR, '/repo/app/src/f.ts')).not.toContain('SECRET_CHECK');
    const both = erasure.erase(`${VALIDATOR}\n${HALVES}`, '/repo/app/src/f.ts')!;
    expect(both).not.toContain('SECRET_CHECK');
    expect(both).not.toContain('SECRET_HALF');
  });

  it('§4.6: a module of @fudic/http is erased without the import mark; the app’s is not', () => {
    expect(erasure.erase(CSRF, '/repo/packages/http/src/csrf.ts')).not.toContain('sec-fetch-site');
    expect(erasure.erase(CSRF, '/repo/app/src/csrf.ts')).toBeNull();
  });

  it('a module with nothing to erase is null', () => {
    expect(erasure.erase('export const a = 1;', '/repo/app/src/plain.ts')).toBeNull();
  });
});

describe('ClientErasure.blank', () => {
  const erasure = new ClientErasure(packageOf);

  it('every JS/TS source is erased in place, with its lines kept; `sources` untouched', () => {
    const map = mapOf(['../../src/auth.ts', '../../src/plain.ts'], [HALVES, 'export const a = 1;']);
    const out = JSON.parse(erasure.blank(map, 'assets/x.js.map', OUT)) as { sources: string[]; sourcesContent: string[] };
    expect(out.sources).toEqual(['../../src/auth.ts', '../../src/plain.ts']);
    expect(out.sourcesContent[0]).not.toContain('SECRET_HALF');
    expect(out.sourcesContent[0]!.split('\n').map((l) => l.length)).toEqual(HALVES.split('\n').map((l) => l.length));
    expect(out.sourcesContent[1]).toBe('export const a = 1;');
  });

  it('the package is resolved from the source’s ABSOLUTE path, from the map’s own directory', () => {
    // `../../../http/src/csrf.ts` from `dist/sw/c/` is `/repo/app/http/…`: `@fudic/http`'s here.
    const map = mapOf(['../../../http/src/csrf.ts'], [CSRF]);
    expect(contentsOf(erasure.blank(map, 'sw/c/x.js.map', OUT))[0]).not.toContain('sec-fetch-site');
    // The same module as the app's own `src/csrf.ts`: no mark, not `@fudic/http`'s, left alone.
    expect(erasure.blank(mapOf(['../../src/csrf.ts'], [CSRF]), 'assets/x.js.map', OUT)).toBe(mapOf(['../../src/csrf.ts'], [CSRF]));
  });

  it('a source that is not JS/TS is not erased, whatever its text', () => {
    const map = mapOf(['../../src/page.fud', '../../src/x.css'], [HALVES, HALVES]);
    expect(erasure.blank(map, 'assets/x.js.map', OUT)).toBe(map);
  });

  it('every JS/TS spelling is one', () => {
    for (const ext of ['js', 'mjs', 'cjs', 'ts', 'mts', 'cts', 'jsx', 'tsx']) {
      expect(contentsOf(erasure.blank(mapOf([`../../src/a.${ext}`], [HALVES]), 'assets/x.js.map', OUT))[0]).not.toContain('SECRET_HALF');
    }
  });

  it('the same string when nothing changes: no texts, a null text, no sources, nothing to erase', () => {
    for (const map of [
      mapOf(['../../src/auth.ts']),
      mapOf(['../../src/auth.ts'], [null]),
      JSON.stringify({ version: 3, mappings: '' }),
      mapOf(['../../src/plain.ts'], ['export const a = 1;']),
    ]) {
      expect(erasure.blank(map, 'assets/x.js.map', OUT)).toBe(map);
    }
  });

  it('by default it asks the real filesystem for the package', () => {
    const map = mapOf(['../../src/auth.ts'], [HALVES]);
    expect(contentsOf(new ClientErasure().blank(map, 'assets/x.js.map', OUT))[0]).not.toContain('SECRET_HALF');
  });
});

describe('nodePackageOf', () => {
  /** A fresh tree under the temporary directory, with these files. */
  function tree(files: Readonly<Record<string, string>>): string {
    const root = mkdtempSync(join(tmpdir(), 'fudic-package-of-'));
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return root;
  }

  it('the name of the nearest package.json above the file, however deep', () => {
    const root = tree({ 'package.json': '{"name":"@fudic/http"}', 'src/deep/er/csrf.ts': '' });
    expect(nodePackageOf()(join(root, 'src', 'deep', 'er', 'csrf.ts'))).toBe('@fudic/http');
  });

  it('the nearest wins over one further up', () => {
    const root = tree({ 'package.json': '{"name":"outer"}', 'inner/package.json': '{"name":"inner"}', 'inner/a.ts': '' });
    expect(nodePackageOf()(join(root, 'inner', 'a.ts'))).toBe('inner');
  });

  it('a manifest that does not parse is skipped: the answer is the parent’s', () => {
    const root = tree({ 'package.json': '{"name":"outer"}', 'inner/package.json': '{ "name": ', 'inner/a.ts': '' });
    expect(nodePackageOf()(join(root, 'inner', 'a.ts'))).toBe('outer');
  });

  it('a name that is not a string is no name', () => {
    const root = tree({ 'package.json': '{"name":42}', 'a.ts': '' });
    expect(nodePackageOf()(join(root, 'a.ts'))).toBeUndefined();
  });

  it('no package.json up to the root of the disk: undefined', () => {
    const root = tree({ 'a.ts': '' });
    // Precondition: nothing above the temporary directory is a package.
    for (let dir = root; dirname(dir) !== dir; dir = dirname(dir)) expect(existsSync(join(dir, 'package.json')), dir).toBe(false);
    expect(nodePackageOf()(join(root, 'a.ts'))).toBeUndefined();
  });

  it('each directory is asked once: the answer is cached', () => {
    const root = tree({ 'package.json': '{"name":"first"}', 'a.ts': '', 'b.ts': '' });
    const packageOfFile = nodePackageOf();
    expect(packageOfFile(join(root, 'a.ts'))).toBe('first');
    rmSync(join(root, 'package.json'));
    expect(packageOfFile(join(root, 'b.ts'))).toBe('first');
    // A new instance asks again.
    expect(nodePackageOf()(join(root, 'b.ts'))).toBeUndefined();
  });
});
