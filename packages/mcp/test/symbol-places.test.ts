/**
 * How `fudic_symbols` and `fudic_contract` name a place and find the handler folders (SDD-77
 * §8.2.28, §8.2.30), on folders of the test's own.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { at, foldersOf } from '../src/symbols.js';
import { tempDir } from './helpers.js';

const dirs: { dispose(): void }[] = [];
afterEach(() => dirs.splice(0).forEach((d) => d.dispose()));

function folder(files: Readonly<Record<string, string>>): string {
  const dir = tempDir();
  dirs.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir.root, path, '..'), { recursive: true });
    writeFileSync(join(dir.root, path), text);
  }
  return dir.root.replace(/\\/gu, '/');
}

describe('at', () => {
  it('a file of the project: its path; of a package: by the package, wherever it was installed', () => {
    const root = folder({
      'src/a.fud': 'x\n',
      'node_modules/@acme/ui/package.json': '{ "name": "@acme/ui" }',
      'node_modules/@acme/ui/src/card.fud': 'x\n',
    });
    expect(at({ file: `${root}/src/a.fud` }, root, null)).toBe('src/a.fud');
    expect(at({ file: `${root}/src/a.fud` }, root)).toBe('src/a.fud');
    expect(at({ file: `${root}/node_modules/@acme/ui/src/card.fud` }, root, '@acme/ui')).toBe('@acme/ui/src/card.fud');
  });

  it('a package that holds no package.json of that name: the path as it is', () => {
    const root = folder({ 'vendor/card.fud': 'x\n', 'vendor/package.json': '{ "name": "other" }' });
    expect(at({ file: `${root}/vendor/card.fud` }, root, '@acme/ui')).toBe('vendor/card.fud');
  });
});

describe('foldersOf', () => {
  it('the folders fudic.json names, or the defaults when it names none or does not parse', () => {
    expect(foldersOf(folder({ 'fudic.json': '{ "server": "back", "browser": "front" }' }))).toEqual({ server: 'back', browser: 'front' });
    const defaults = foldersOf(folder({ 'fudic.json': '{}' }));
    expect(foldersOf(folder({ 'fudic.json': '{' }))).toEqual(defaults);
    expect(defaults).toEqual({ server: expect.any(String), browser: expect.any(String) });
  });
});
