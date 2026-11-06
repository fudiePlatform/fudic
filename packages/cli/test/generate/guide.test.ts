/**
 * SDD-79 §3.5, §4.12 — the style guide from the CLI, criteria 25–31: what `fudic new`, `new
 * --workspace`, `g app`, `g lib`, `g guide` and `add` write, through the binary, over a memory
 * disk. The builds of what they write are `new-build.test.ts` and `workspace/e2e.test.ts`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../src/args.js';
import { planGuide } from '../../src/plans/guide.js';
import { run } from '../../src/run.js';
import { captureStreams, MemoryFs, RecordingRunner } from '../helpers.js';

const ROOT = '/w';
const SHOP = `${ROOT}/shop`;
const TEMPLATE = fileURLToPath(new URL('../../templates/guide/', import.meta.url));

interface Ran {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

async function cli(fs: MemoryFs, ...argv: string[]): Promise<Ran> {
  const capture = captureStreams();
  const code = await run(argv, { readIo: fs, writeIo: fs, runner: new RecordingRunner(), streams: capture.streams });
  return { code, out: capture.stdout(), err: capture.stderr() };
}

async function ok(fs: MemoryFs, ...argv: string[]): Promise<Ran> {
  const ran = await cli(fs, ...argv);
  if (ran.code !== 0) throw new Error(`fudic ${argv.join(' ')} exited ${ran.code}:\n${ran.out}${ran.err}`);
  return ran;
}

const json = (fs: MemoryFs, path: string): Record<string, unknown> => JSON.parse(fs.at(path)) as Record<string, unknown>;
const deps = (fs: MemoryFs, path: string): Record<string, string> => (json(fs, path)['dependencies'] ?? {}) as Record<string, string>;
const under = (fs: MemoryFs, dir: string): string[] => fs.paths().filter((p) => p.startsWith(dir)).map((p) => p.slice(dir.length));

/** Every file of the template, relative to it: what a guide holds. */
function templateFiles(): string[] {
  return (readdirSync(TEMPLATE, { recursive: true, withFileTypes: true }) as { name: string; parentPath: string; isFile(): boolean }[])
    .filter((e) => e.isFile())
    .map((e) => resolve(e.parentPath, e.name).slice(resolve(TEMPLATE).length + 1).replace(/\\/gu, '/'))
    .sort();
}

const key = (path: string): string => resolve(path).replace(/\\/gu, '/').replace(/^[a-z]:/u, (d) => d.toUpperCase());

describe('fudic new <app> (criterion 25)', () => {
  it('writes src/guide/ with the template, the .tmpl aside, and names it in fudic.json', async () => {
    const fs = new MemoryFs({}, ROOT);
    await ok(fs, 'new', 'tienda', '--no-install', '--no-git', '--cwd', ROOT);
    expect(under(fs, 'tienda/src/guide/')).toEqual(templateFiles().filter((f) => !f.endsWith('.tmpl')));
    expect(json(fs, 'tienda/fudic.json')).toMatchObject({
      globalStyles: { base: 'src/guide/base.css' },
      guide: { sheet: 'src/guide/guide.css', icon: 'src/guide/logo.svg' },
    });
    // The CSS is rendered for the project; the font is the template's, byte for byte.
    expect(fs.at('tienda/src/guide/tokens.css')).toContain('--tienda-ink:');
    expect(fs.at('tienda/src/guide/tokens.css')).not.toContain('{{project}}');
    for (const font of ['InterVariable.woff2', 'InterVariable-Italic.woff2', 'OFL.txt']) {
      const written = fs.bytes.get(key(`${ROOT}/tienda/src/guide/fonts/${font}`));
      expect(written, font).toEqual(new Uint8Array(readFileSync(`${TEMPLATE}fonts/${font}`)));
    }
  });
});

describe('fudic new --workspace (criterion 26)', () => {
  it('always writes libs/guide, as a library of the workspace', async () => {
    const fs = new MemoryFs({}, ROOT);
    await ok(fs, 'new', 'shop', '--workspace', '--no-install', '--no-git', '--cwd', ROOT);
    const files = under(fs, 'shop/libs/guide/');
    expect(files).toEqual(
      templateFiles()
        .map((f) => f.replace(/\.tmpl$/u, ''))
        .sort(),
    );
    expect(json(fs, 'shop/libs/guide/fudic.json')).toMatchObject({ kind: 'lib', guide: { sheet: 'guide.css', icon: 'logo.svg' } });
    expect(json(fs, 'shop/libs/guide/package.json')).toMatchObject({ name: '@shop/guide' });
  });

  it('with --app tienda --lib ui, both depend on the guide', async () => {
    const fs = new MemoryFs({}, ROOT);
    await ok(fs, 'new', 'shop', '--workspace', '--app', 'tienda', '--lib', 'ui', '--no-install', '--no-git', '--cwd', ROOT);
    expect(deps(fs, 'shop/apps/tienda/package.json')).toMatchObject({ '@shop/guide': 'workspace:*' });
    expect(deps(fs, 'shop/libs/ui/package.json')).toMatchObject({ '@shop/guide': 'workspace:*' });
  });

  it('a --lib guide or --uses guide does not write it twice', async () => {
    const fs = new MemoryFs({}, ROOT);
    await ok(fs, 'new', 'shop', '--workspace', '--app', 'web', '--uses', 'guide', '--lib', 'guide', '--no-install', '--no-git', '--cwd', ROOT);
    expect(fs.paths().filter((p) => p === 'shop/libs/guide/fudic.json')).toHaveLength(1);
    expect(Object.keys(deps(fs, 'shop/apps/web/package.json')).filter((d) => d === '@shop/guide')).toHaveLength(1);
  });
});

describe('g app and g lib in a workspace (criterion 27)', () => {
  it('depend on every guide of the workspace', async () => {
    const fs = new MemoryFs({}, ROOT);
    await ok(fs, 'new', 'shop', '--workspace', '--app', 'tienda', '--no-install', '--no-git', '--cwd', ROOT);
    await ok(fs, 'g', 'app', 'admin', '--cwd', SHOP);
    await ok(fs, 'g', 'lib', 'ui', '--cwd', SHOP);
    expect(deps(fs, 'shop/apps/admin/package.json')).toMatchObject({ '@shop/guide': 'workspace:*' });
    expect(deps(fs, 'shop/libs/ui/package.json')).toMatchObject({ '@shop/guide': 'workspace:*' });
  });
});

describe('fudic g guide (criterion 28)', () => {
  it('in a workspace: a library, guide by default; again, it fails', async () => {
    const fs = new MemoryFs({}, ROOT);
    await ok(fs, 'new', 'shop', '--workspace', '--no-install', '--no-git', '--cwd', ROOT);
    const { out } = await ok(fs, 'g', 'guide', 'brand', '--cwd', SHOP);
    expect(out).toBe(`
Created style guide brand in libs/brand

  every page of a project that depends on it links the guide, pruned to what it uses
  a component adopts its pieces by name: shadowrootadoptedstylesheets="button"

Use it
  fudic add brand --project <app or library>
`);
    expect(json(fs, 'shop/libs/brand/package.json')).toMatchObject({ name: '@shop/brand' });
    expect(fs.at('shop/libs/brand/tokens.css')).toContain('--brand-ink:');
    const again = await cli(fs, 'g', 'guide', 'brand', '--cwd', SHOP);
    expect(again.code).toBe(1);
    // libs/guide is there since new --workspace: `g guide` alone is that one.
    expect((await cli(fs, 'g', 'guide', '--cwd', SHOP)).code).toBe(1);
  });

  it('in a standalone app: src/guide/, named in its fudic.json beside what it had; again, FUD1444', async () => {
    const fs = new MemoryFs(
      {
        'app/fudic.json': JSON.stringify({ id: 'app', kind: 'app', globalStyles: { theme: 'theme.css' } }),
        'app/theme.css': ':host {}',
        'app/package.json': JSON.stringify({ name: 'app' }),
      },
      ROOT,
    );
    const { out } = await ok(fs, 'g', 'guide', '--cwd', `${ROOT}/app`);
    expect(out).toContain('Created the style guide in src/guide');
    expect(json(fs, 'app/fudic.json')).toMatchObject({
      globalStyles: { theme: 'theme.css', base: 'src/guide/base.css' },
      guide: { sheet: 'src/guide/guide.css', icon: 'src/guide/logo.svg' },
    });
    expect(fs.paths()).toContain('app/src/guide/guide.css');
    expect(fs.paths()).not.toContain('app/src/guide/package.json');
    const again = await cli(fs, 'g', 'guide', '--cwd', `${ROOT}/app`);
    expect(again.code).toBe(1);
    expect(again.out).toContain('FUD1444');
  });

  it('an app with no globalStyles gets the guide\'s base alone', async () => {
    const fs = new MemoryFs({ 'app/fudic.json': JSON.stringify({ id: 'app', kind: 'app' }) }, ROOT);
    await ok(fs, 'g', 'guide', '--cwd', `${ROOT}/app`);
    expect(json(fs, 'app/fudic.json')['globalStyles']).toEqual({ base: 'src/guide/base.css' });
  });

  it('outside any project, and where the guide\'s files are there already: errors, nothing planned', async () => {
    const nowhere = await planGuide('guide', { cwd: '/nowhere', force: false, dir: 'libs' }, new MemoryFs({}, '/nowhere'));
    expect(nowhere.changes).toEqual([]);
    expect(nowhere.errors.length).toBeGreaterThan(0);

    const taken = new MemoryFs({ 'fudic.json': JSON.stringify({ id: 'a', kind: 'app' }), 'src/guide/fonts/OFL.txt': 'mine' }, '/a');
    const plan = await planGuide('guide', { cwd: '/a', force: false, dir: 'libs' }, taken);
    expect(plan.errors.map((e) => e.code)).toContain('FUD0443');
    const forced = await planGuide('guide', { cwd: '/a', force: true, dir: 'libs' }, taken);
    expect(forced.errors).toEqual([]);
  });

  it('a workspace whose libs/ still has its .gitkeep loses it with the guide', async () => {
    const fs = new MemoryFs({}, ROOT);
    await ok(fs, 'new', 'shop', '--workspace', '--no-install', '--no-git', '--cwd', ROOT);
    fs.write(`${SHOP}/libs/.gitkeep`, '');
    await ok(fs, 'g', 'guide', 'brand', '--cwd', SHOP);
    expect(fs.paths()).not.toContain('shop/libs/.gitkeep');
  });

  it('takes --dir and nothing it does not know', () => {
    expect(parseArgs(['g', 'guide'])).toMatchObject({ kind: 'guide', name: 'guide', opts: { dir: 'libs' } });
    expect(parseArgs(['g', 'guide', 'brand', '--dir', 'shared'])).toMatchObject({ kind: 'guide', name: 'brand', opts: { dir: 'shared' } });
    expect(parseArgs(['g', 'guide', '--zz'])).toMatchObject({
      kind: 'error',
      error: { code: 'FUD0448', message: 'unknown flag --zz' },
      hints: ['it takes: --dir, --dry-run, --force'],
    });
  });
});

describe('g lib --styles-only (criterion 29)', () => {
  it('is an unknown flag, and says the guide is its own command', () => {
    expect(parseArgs(['g', 'lib', 'guia', '--styles-only'])).toEqual({
      kind: 'error',
      error: { severity: 'error', code: 'FUD0448', message: 'unknown flag --styles-only' },
      topic: 'generate lib',
      hints: ['a style guide is its own command:   fudic g guide guia'],
    });
  });
});

describe('fudic add <guide> (criterion 30)', () => {
  it('touches only package.json', async () => {
    const fs = new MemoryFs({}, ROOT);
    await ok(fs, 'new', 'shop', '--workspace', '--app', 'tienda', '--no-install', '--no-git', '--cwd', ROOT);
    await ok(fs, 'g', 'guide', 'brand', '--cwd', SHOP);
    const before = new Map(fs.paths().map((p) => [p, fs.at(p)]));
    await ok(fs, 'add', 'brand', '--project', 'tienda', '--cwd', SHOP);
    const changed = fs.paths().filter((p) => before.get(p) !== fs.at(p));
    expect(changed).toEqual(['shop/apps/tienda/package.json']);
    expect(deps(fs, 'shop/apps/tienda/package.json')).toMatchObject({ '@shop/brand': 'workspace:*' });
  });
});

describe('--dry-run (criterion 31)', () => {
  it('lists the fonts with their size, and writes nothing', async () => {
    const fs = new MemoryFs({}, ROOT);
    const { out } = await ok(fs, 'new', 'tienda', '--dry-run', '--no-install', '--no-git', '--cwd', ROOT);
    expect(out).toMatch(/create {2}tienda\/src\/guide\/fonts\/InterVariable\.woff2 \(\d+\.\d KB\)/u);
    expect(out).toMatch(/create {2}tienda\/src\/guide\/fonts\/OFL\.txt \(\d+(\.\d)? (KB|B)\)/u);
    expect(fs.paths()).toEqual([]);
  });

  it('--json gives a binary file its size, never its bytes', async () => {
    const fs = new MemoryFs({}, ROOT);
    const { out } = await ok(fs, 'new', 'tienda', '--dry-run', '--json', '--no-install', '--no-git', '--cwd', ROOT);
    const plan = JSON.parse(out) as { changes: { path: string; size?: number; contents?: string }[] };
    const font = plan.changes.find((c) => c.path === 'tienda/src/guide/fonts/InterVariable.woff2');
    expect(font).toEqual({ kind: 'create', path: 'tienda/src/guide/fonts/InterVariable.woff2', size: readFileSync(`${TEMPLATE}fonts/InterVariable.woff2`).length });
  });

  it('a small binary is said in bytes', async () => {
    const fs = new MemoryFs({}, ROOT);
    const { out } = await ok(fs, 'new', 'tienda', '--dry-run', '--no-install', '--no-git', '--cwd', ROOT);
    expect(out).toMatch(/create {2}tienda\/src\/guide\/logo\.svg \(\d+ B\)/u);
  });
});
