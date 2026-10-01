/**
 * Where "Explain FUDnnnn" finds a code's `.md`: in the package's `src/codes/` whether this
 * module runs from `src/` or from `dist/src/`, and in `codes/` beside a bundle.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { explanationFile, explanationsDir } from '../src/explain.js';

const CODES = fileURLToPath(new URL('../src/codes/', import.meta.url));
const root = fileURLToPath(new URL('../', import.meta.url));

describe('explanationsDir', () => {
  it('is the package’s src/codes/ when this module runs from src/', () => {
    expect(explanationsDir()).toBe(CODES);
  });

  it('is the same folder when it runs from dist/src/, once built', () => {
    const built = pathToFileURL(join(root, 'dist', 'src', 'explain.js')).href;
    expect(explanationsDir(built)).toBe(CODES);
  });

  it('is codes/ beside the bundle when it runs bundled into the editor’s server', () => {
    const bundle = pathToFileURL(join(root, 'ext', 'dist', 'server.js')).href;
    expect(explanationsDir(bundle)).toBe(join(root, 'ext', 'dist', 'codes', '/'));
  });
});

describe('explanationFile', () => {
  it('names a file that exists, for every explanation the package ships', () => {
    const shipped = readdirSync(CODES).filter((f) => f.endsWith('.md'));
    expect(shipped.length).toBeGreaterThan(200);
    for (const md of shipped) {
      const file = explanationFile(md.slice(0, -3) as `FUD${number}`);
      expect(file).toBe(join(CODES, md));
      expect(existsSync(file)).toBe(true);
    }
  });

  it('looks in the folder it is given', () => {
    expect(explanationFile('FUD0051', '/x/codes')).toBe(join('/x/codes', 'FUD0051.md'));
  });
});
