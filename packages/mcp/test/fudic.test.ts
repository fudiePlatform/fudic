/**
 * Which fudic answers (SDD-77 §8.2.7, §8.2.13, §8.2.24): the project's own checker, found through
 * its `@fudic/vite`, and its own CLI; the server's only when the project has none, or one too old.
 * The project's packages are written on disk; the importer stands in for `import()`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import * as serverCli from '@fudic/cli';
import * as serverCheck from '@fudic/typecheck';
import * as serverApi from '@fudic/typecheck/api';
import { exportedFile, loadFudic, packageDir, type Importer } from '../src/fudic.js';
import { tempDir } from './helpers.js';

let dir: ReturnType<typeof tempDir>;

afterEach(() => {
  dir.dispose();
});

function write(files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir.root, path)), { recursive: true });
    writeFileSync(join(dir.root, path), text);
  }
}

const manifest = (exports: Record<string, unknown>): string => JSON.stringify({ name: 'x', exports });

/** An importer that answers a module per file, and remembers what it was asked. */
function importer(): Importer & { readonly asked: string[] } {
  const asked: string[] = [];
  const load = (url: string): Promise<unknown> => {
    asked.push(url);
    if (url.endsWith('/typecheck/dist/index.js')) return Promise.resolve({ createProjectChecker: 'project checker' });
    if (url.endsWith('/typecheck/dist/api-project.js')) return Promise.resolve({ writeApiDeclarations: 'project declarations' });
    if (url.endsWith('/cli/dist/index.js')) return Promise.resolve({ planNew: 'project cli' });
    return Promise.reject(new Error(`unexpected import ${url}`));
  };
  return Object.assign(load, { asked });
}

const VITE = 'node_modules/@fudic/vite';
const TYPECHECK = `${VITE}/node_modules/@fudic/typecheck`;

describe('packageDir', () => {
  it('in the folder, or the nearest above it, as Node finds a package', () => {
    dir = tempDir();
    write({ 'node_modules/a/package.json': '{}', 'sub/deep/.keep': '' });
    expect(packageDir('a', join(dir.root, 'sub', 'deep'))).toBe(join(dir.root, 'node_modules', 'a'));
    expect(packageDir('a', dir.root)).toBe(join(dir.root, 'node_modules', 'a'));
  });

  it('a folder without package.json is no package; none up to the root is undefined', () => {
    dir = tempDir();
    write({ 'node_modules/b/index.js': '' });
    expect(packageDir('b', dir.root)).toBeUndefined();
    expect(packageDir('@fudic/never-installed', dir.root)).toBeUndefined();
  });
});

describe('exportedFile', () => {
  it('the import of a subpath, written as an object or as a string', () => {
    dir = tempDir();
    write({ 'p/package.json': manifest({ '.': { types: './a.d.ts', import: './dist/a.js' }, './api': './dist/api.js' }) });
    const p = join(dir.root, 'p');
    expect(exportedFile(p, '.')).toBe(join(p, 'dist', 'a.js'));
    expect(exportedFile(p, './api')).toBe(join(p, 'dist', 'api.js'));
  });

  it('undefined for a subpath it does not export, one without import, or no exports at all', () => {
    dir = tempDir();
    write({ 'p/package.json': manifest({ '.': { types: './a.d.ts' } }), 'q/package.json': '{}' });
    expect(exportedFile(join(dir.root, 'p'), './api')).toBeUndefined();
    expect(exportedFile(join(dir.root, 'p'), '.')).toBeUndefined();
    expect(exportedFile(join(dir.root, 'q'), '.')).toBeUndefined();
  });
});

describe('loadFudic', () => {
  const typecheck = manifest({ '.': { import: './dist/index.js' }, './api': { import: './dist/api-project.js' } });
  const cli = manifest({ '.': { import: './dist/index.js' } });

  it('the project installed everything: its checker through its @fudic/vite, and its CLI', async () => {
    dir = tempDir();
    write({ [`${VITE}/package.json`]: '{}', [`${TYPECHECK}/package.json`]: typecheck, 'node_modules/@fudic/cli/package.json': cli });
    const load = importer();
    const fudic = await loadFudic(dir.root, load);
    expect(fudic.from).toEqual({ check: 'project', cli: 'project' });
    expect(fudic.createProjectChecker).toBe('project checker');
    expect(fudic.writeApiDeclarations).toBe('project declarations');
    expect(fudic.cli).toEqual({ planNew: 'project cli' });
    expect(load.asked).toEqual([
      pathToFileURL(join(dir.root, TYPECHECK, 'dist', 'index.js')).href,
      pathToFileURL(join(dir.root, TYPECHECK, 'dist', 'api-project.js')).href,
      pathToFileURL(join(dir.root, 'node_modules/@fudic/cli/dist/index.js')).href,
    ]);
  });

  it('a project with nothing installed: the server\'s own, and nothing imported by URL', async () => {
    dir = tempDir();
    const load = importer();
    const fudic = await loadFudic(dir.root, load);
    expect(fudic.from).toEqual({ check: 'server', cli: 'server' });
    expect(fudic.createProjectChecker).toBe(serverCheck.createProjectChecker);
    expect(fudic.writeApiDeclarations).toBe(serverApi.writeApiDeclarations);
    expect(fudic.cli.planNew).toBe(serverCli.planNew);
    expect(load.asked).toEqual([]);
  });

  it('@fudic/vite without its typecheck beside it: the server\'s checker', async () => {
    dir = tempDir();
    write({ [`${VITE}/package.json`]: '{}' });
    expect((await loadFudic(dir.root, importer())).from.check).toBe('server');
  });

  it('a typecheck older than ./api cannot answer as the build would: the server\'s', async () => {
    dir = tempDir();
    write({ [`${VITE}/package.json`]: '{}', [`${TYPECHECK}/package.json`]: manifest({ '.': { import: './dist/index.js' } }) });
    const load = importer();
    expect((await loadFudic(dir.root, load)).from.check).toBe('server');
    expect(load.asked).toEqual([]);
  });

  it('a typecheck without a main entry: the server\'s', async () => {
    dir = tempDir();
    write({ [`${VITE}/package.json`]: '{}', [`${TYPECHECK}/package.json`]: manifest({ './api': { import: './dist/api-project.js' } }) });
    expect((await loadFudic(dir.root, importer())).from.check).toBe('server');
  });

  it('a CLI that exports nothing to import: the server\'s', async () => {
    dir = tempDir();
    write({ 'node_modules/@fudic/cli/package.json': manifest({}) });
    expect((await loadFudic(dir.root, importer())).from).toEqual({ check: 'server', cli: 'server' });
  });

  it('by default, import() itself: a real project install loads', async () => {
    dir = tempDir();
    write({ [`${TYPECHECK}/package.json`]: typecheck, [`${VITE}/package.json`]: '{}' });
    write({
      [`${TYPECHECK}/dist/index.js`]: 'export const createProjectChecker = () => "mine";\n',
      [`${TYPECHECK}/dist/api-project.js`]: 'export const writeApiDeclarations = () => [];\n',
    });
    const fudic = await loadFudic(dir.root);
    expect(fudic.from.check).toBe('project');
    expect((fudic.createProjectChecker as unknown as () => string)()).toBe('mine');
  });
});
