/**
 * SDD-79 §3.5, §4.12 — the style guide from the CLI, criteria 25–31: what `fudic new`, `new
 * --workspace`, `g app`, `g lib`, `g guide` and `add` write, through the binary, over a memory
 * disk. Every project depends on `@fudic/guide`, the guide fudic.dev uses, until it takes a copy of
 * its own (`g guide`, then `add` in a workspace): a project has one guide. The builds of what they write are
 * `new-build.test.ts` and `workspace/e2e.test.ts`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../src/args.js';
import { planGuide } from '../../src/plans/guide.js';
import { FUDIC_VERSION } from '../../src/project.js';
import { run } from '../../src/run.js';
import { dropDependency, withoutDependency } from '../../src/workspace/modules.js';
import { captureStreams, MemoryFs, RecordingRunner } from '../helpers.js';

const ROOT = '/w';
const SHOP = `${ROOT}/shop`;
/** The installed `@fudic/guide`: what every copy is made from. */
const PACKAGE = `${dirname(createRequire(import.meta.url).resolve('@fudic/guide/fudic.json'))}/`;
const FONT = 'fonts/inter-tight-wght-400-600.woff2';

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

/** Every file of the package a copy takes, relative to it: all but what makes it a package. */
function packageFiles(): string[] {
  return (readdirSync(PACKAGE, { recursive: true, withFileTypes: true }) as { name: string; parentPath: string; isFile(): boolean }[])
    .filter((e) => e.isFile())
    .map((e) => resolve(e.parentPath, e.name).slice(resolve(PACKAGE).length + 1).replace(/\\/gu, '/'))
    .filter((f) => !['package.json', 'README.md', 'fudic.json'].includes(f))
    .sort();
}

const key = (path: string): string => resolve(path).replace(/\\/gu, '/').replace(/^[a-z]:/u, (d) => d.toUpperCase());

/** What the memory disk holds at `path`, as bytes: a binary as written, a text encoded. */
function written(fs: MemoryFs, path: string): Uint8Array {
  return fs.bytes.get(key(`${ROOT}/${path}`)) ?? new Uint8Array(Buffer.from(fs.at(path), 'utf8'));
}

/** Every file of the copy in `dir` is the package's, byte for byte. */
function expectCopy(fs: MemoryFs, dir: string): void {
  for (const file of packageFiles()) {
    expect(written(fs, `${dir}${file}`), file).toEqual(new Uint8Array(readFileSync(`${PACKAGE}${file}`)));
  }
}

describe('fudic new <app> (criterion 25)', () => {
  it('copies no guide and names none: it depends on @fudic/guide, after @fudic/dom', async () => {
    const fs = new MemoryFs({}, ROOT);
    await ok(fs, 'new', 'tienda', '--no-install', '--no-git', '--cwd', ROOT);
    expect(under(fs, 'tienda/src/guide/')).toEqual([]);
    const config = json(fs, 'tienda/fudic.json');
    expect(config).not.toHaveProperty('guide');
    expect(config).not.toHaveProperty('globalStyles');
    expect(Object.entries(deps(fs, 'tienda/package.json'))).toEqual([
      ['@fudic/core', FUDIC_VERSION],
      ['@fudic/dom', FUDIC_VERSION],
      ['@fudic/guide', FUDIC_VERSION],
      ['@fudic/ssr', FUDIC_VERSION],
      ['@fudic/transport', FUDIC_VERSION],
    ]);
    expect(fs.at('tienda/README.md')).toContain(
      '- The style guide is `@fudic/guide`, the one fudic.dev uses: every page links it; a component adopts its pieces by name, `shadowrootadoptedstylesheets="button"`. `fudic g guide` makes a copy of your own.',
    );
  });
});

describe('fudic new --workspace (criterion 26)', () => {
  it('writes no libs/guide, and keeps an empty libs/ in git', async () => {
    const fs = new MemoryFs({}, ROOT);
    const { out } = await ok(fs, 'new', 'shop', '--workspace', '--no-install', '--no-git', '--cwd', ROOT);
    expect(under(fs, 'shop/libs/')).toEqual(['.gitkeep']);
    expect(out).toContain('  style guide: @fudic/guide, the one fudic.dev uses — fudic g guide makes a copy of your own\n');
  });

  it('with --app tienda --lib ui, both depend on @fudic/guide', async () => {
    const fs = new MemoryFs({}, ROOT);
    await ok(fs, 'new', 'shop', '--workspace', '--app', 'tienda', '--lib', 'ui', '--no-install', '--no-git', '--cwd', ROOT);
    expect(deps(fs, 'shop/apps/tienda/package.json')).toMatchObject({ '@fudic/guide': FUDIC_VERSION });
    expect(deps(fs, 'shop/libs/ui/package.json')).toEqual({ '@fudic/guide': FUDIC_VERSION });
    expect(fs.paths()).not.toContain('shop/libs/.gitkeep');
    expect(fs.at('shop/README.md')).toContain('The style guide is `@fudic/guide`');
  });
});

describe('g app and g lib in a workspace (criterion 27)', () => {
  it('depend on @fudic/guide while the workspace has no copy of its own', async () => {
    const fs = new MemoryFs({}, ROOT);
    await ok(fs, 'new', 'shop', '--workspace', '--app', 'tienda', '--no-install', '--no-git', '--cwd', ROOT);
    await ok(fs, 'g', 'app', 'admin', '--cwd', SHOP);
    await ok(fs, 'g', 'lib', 'ui', '--cwd', SHOP);
    expect(deps(fs, 'shop/apps/admin/package.json')).toMatchObject({ '@fudic/guide': FUDIC_VERSION });
    expect(deps(fs, 'shop/libs/ui/package.json')).toEqual({ '@fudic/guide': FUDIC_VERSION });
  });

  it('depend on the copy instead once there is one, and not on @fudic/guide', async () => {
    const fs = new MemoryFs({}, ROOT);
    await ok(fs, 'new', 'shop', '--workspace', '--no-install', '--no-git', '--cwd', ROOT);
    await ok(fs, 'g', 'guide', 'brand', '--cwd', SHOP);
    await ok(fs, 'g', 'app', 'admin', '--cwd', SHOP);
    await ok(fs, 'g', 'lib', 'ui', '--cwd', SHOP);
    expect(deps(fs, 'shop/apps/admin/package.json')).toMatchObject({ '@shop/brand': 'workspace:*' });
    expect(deps(fs, 'shop/apps/admin/package.json')).not.toHaveProperty('@fudic/guide');
    expect(deps(fs, 'shop/libs/ui/package.json')).toEqual({ '@shop/brand': 'workspace:*' });
    expect(fs.at('shop/apps/admin/README.md')).toContain("- The style guide is the workspace's own copy of `@fudic/guide`");
  });
});

describe('fudic g guide (criterion 28)', () => {
  it('in a workspace: a library, guide by default, a copy of @fudic/guide byte for byte; again, it fails', async () => {
    const fs = new MemoryFs({}, ROOT);
    await ok(fs, 'new', 'shop', '--workspace', '--no-install', '--no-git', '--cwd', ROOT);
    const { out } = await ok(fs, 'g', 'guide', 'brand', '--cwd', SHOP);
    expect(out).toBe(`
Created style guide brand in libs/brand, a copy of @fudic/guide to make your own

  every page of a project that depends on it links the guide, pruned to what it uses
  a component adopts its pieces by name: shadowrootadoptedstylesheets="button"

Use it
  fudic add brand --project <app or library>   it replaces @fudic/guide there
`);
    expect(under(fs, 'shop/libs/brand/')).toEqual([...packageFiles(), 'README.md', 'fudic.json', 'package.json'].sort());
    expectCopy(fs, 'shop/libs/brand/');
    expect(json(fs, 'shop/libs/brand/package.json')).toMatchObject({ name: '@shop/brand' });
    expect(json(fs, 'shop/libs/brand/fudic.json')).toMatchObject({ kind: 'lib', guide: { sheet: 'guide.css', icon: 'logo.svg' } });
    expect(fs.at('shop/libs/brand/README.md')).toContain('a copy of `@fudic/guide`');
    expect(fs.at('shop/libs/brand/README.md')).toContain('fudic add brand --project');
    expect(fs.at('shop/libs/brand/tokens.css')).toContain('--guide-ink:');
    // The placeholder that kept libs/ in git goes with it.
    expect(fs.paths()).not.toContain('shop/libs/.gitkeep');
    const again = await cli(fs, 'g', 'guide', 'brand', '--cwd', SHOP);
    expect(again.code).toBe(1);
    // `g guide` alone is a library named guide.
    await ok(fs, 'g', 'guide', '--cwd', SHOP);
    expect(json(fs, 'shop/libs/guide/package.json')).toMatchObject({ name: '@shop/guide' });
  });

  it('in an app from fudic new: src/guide/ byte for byte, named in fudic.json, and @fudic/guide gone', async () => {
    const fs = new MemoryFs({}, ROOT);
    await ok(fs, 'new', 'tienda', '--no-install', '--no-git', '--cwd', ROOT);
    const { out } = await ok(fs, 'g', 'guide', '--cwd', `${ROOT}/tienda`);
    expect(out).toBe(`
Created the style guide in src/guide, a copy of @fudic/guide to make your own

  every page links it, pruned to what it uses
  a component adopts its pieces by name: shadowrootadoptedstylesheets="button"
  the app no longer depends on @fudic/guide: a project has one guide
`);
    expect(Object.keys(deps(fs, 'tienda/package.json'))).toEqual(['@fudic/core', '@fudic/dom', '@fudic/ssr', '@fudic/transport']);
    expect(fs.at('tienda/package.json')).not.toContain('@fudic/guide');
    expect(under(fs, 'tienda/src/guide/')).toEqual(packageFiles());
    expectCopy(fs, 'tienda/src/guide/');
    expect(json(fs, 'tienda/fudic.json')).toMatchObject({
      globalStyles: { base: 'src/guide/base.css' },
      guide: { sheet: 'src/guide/guide.css', icon: 'src/guide/logo.svg' },
    });
  });

  it('in a standalone app: named in its fudic.json beside what it had; again, FUD1444', async () => {
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
    // It did not depend on @fudic/guide: its package.json is left as it was.
    expect(out).not.toContain('no longer depends');
    expect(fs.at('app/package.json')).toBe(JSON.stringify({ name: 'app' }));
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

  it('an app with no globalStyles and no package.json gets the guide\'s base alone', async () => {
    const fs = new MemoryFs({ 'app/fudic.json': JSON.stringify({ id: 'app', kind: 'app' }) }, ROOT);
    await ok(fs, 'g', 'guide', '--cwd', `${ROOT}/app`);
    expect(json(fs, 'app/fudic.json')['globalStyles']).toEqual({ base: 'src/guide/base.css' });
  });

  it('outside any project, and where the guide\'s files are there already: errors, nothing planned', async () => {
    const nowhere = await planGuide('guide', { cwd: '/nowhere', force: false, dir: 'libs' }, new MemoryFs({}, '/nowhere'));
    expect(nowhere.changes).toEqual([]);
    expect(nowhere.errors.length).toBeGreaterThan(0);

    const taken = new MemoryFs({ 'fudic.json': JSON.stringify({ id: 'a', kind: 'app' }), [`src/guide/${FONT}`]: 'mine' }, '/a');
    const plan = await planGuide('guide', { cwd: '/a', force: false, dir: 'libs' }, taken);
    expect(plan.errors.map((e) => e.code)).toContain('FUD0443');
    const forced = await planGuide('guide', { cwd: '/a', force: true, dir: 'libs' }, taken);
    expect(forced.errors).toEqual([]);
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
  it('touches only package.json: the copy in, @fudic/guide out', async () => {
    const fs = new MemoryFs({}, ROOT);
    await ok(fs, 'new', 'shop', '--workspace', '--app', 'tienda', '--no-install', '--no-git', '--cwd', ROOT);
    await ok(fs, 'g', 'guide', 'brand', '--cwd', SHOP);
    const before = new Map(fs.paths().map((p) => [p, fs.at(p)]));
    const { out } = await ok(fs, 'add', 'brand', '--project', 'tienda', '--cwd', SHOP);
    const changed = fs.paths().filter((p) => before.get(p) !== fs.at(p));
    expect(changed).toEqual(['shop/apps/tienda/package.json']);
    expect(deps(fs, 'shop/apps/tienda/package.json')).toMatchObject({ '@shop/brand': 'workspace:*' });
    expect(deps(fs, 'shop/apps/tienda/package.json')).not.toHaveProperty('@fudic/guide');
    expect(out).toContain('tienda now uses brand\n  and no longer @fudic/guide: a project has one guide\n');
  });

  it('a library that is no guide leaves @fudic/guide where it is', async () => {
    const fs = new MemoryFs({}, ROOT);
    await ok(fs, 'new', 'shop', '--workspace', '--app', 'tienda', '--lib', 'ui', '--no-install', '--no-git', '--cwd', ROOT);
    const { out } = await ok(fs, 'add', 'ui', '--project', 'tienda', '--cwd', SHOP);
    expect(deps(fs, 'shop/apps/tienda/package.json')).toMatchObject({ '@shop/ui': 'workspace:*', '@fudic/guide': FUDIC_VERSION });
    expect(out).not.toContain('no longer');
  });
});

describe('taking @fudic/guide out of a package.json', () => {
  const pkg = (dependencies: Record<string, string> | undefined): string =>
    `${JSON.stringify({ name: 'x', ...(dependencies === undefined ? {} : { dependencies }), devDependencies: { '@fudic/guide': '1' } }, null, 2)}\n`;
  const without = (dependencies: Record<string, string> | undefined): unknown => {
    const text = withoutDependency(pkg(dependencies), '@fudic/guide');
    return text === undefined ? undefined : JSON.parse(text);
  };

  it('in the middle, last, or alone: the line goes, and the comma that joined it', () => {
    expect(without({ a: '1', '@fudic/guide': '1', b: '1' })).toMatchObject({ dependencies: { a: '1', b: '1' } });
    expect(without({ a: '1', '@fudic/guide': '1' })).toMatchObject({ dependencies: { a: '1' } });
    expect(without({ '@fudic/guide': '1' })).toMatchObject({ dependencies: {} });
    // Nothing else of the file moves.
    expect(withoutDependency(pkg({ a: '1', '@fudic/guide': '1', b: '1' }), '@fudic/guide')).toBe(pkg({ a: '1', b: '1' }));
    expect(withoutDependency(pkg({ a: '1', '@fudic/guide': '1' }), '@fudic/guide')).toBe(pkg({ a: '1' }));
  });

  it('nothing to do with no dependencies, or none of it: a devDependency is not one', () => {
    expect(without(undefined)).toBeUndefined();
    expect(without({ a: '1' })).toBeUndefined();
  });

  it('a project with no package.json has nothing to drop', () => {
    const fs = new MemoryFs({}, '/p');
    expect(dropDependency({ path: '/p', dir: '.' } as Parameters<typeof dropDependency>[0], '@fudic/guide', fs)).toBeUndefined();
  });
});

describe('--dry-run (criterion 31)', () => {
  it('lists the font with its size, and writes nothing', async () => {
    const fs = new MemoryFs({ 'app/fudic.json': JSON.stringify({ id: 'app', kind: 'app' }) }, ROOT);
    const { out } = await ok(fs, 'g', 'guide', '--dry-run', '--cwd', `${ROOT}/app`);
    expect(out).toMatch(/create {2}src\/guide\/fonts\/inter-tight-wght-400-600\.woff2 \(\d+\.\d KB\)/u);
    expect(fs.paths()).toEqual(['app/fudic.json']);
  });

  it('--json gives a binary file its size, never its bytes', async () => {
    const fs = new MemoryFs({ 'app/fudic.json': JSON.stringify({ id: 'app', kind: 'app' }) }, ROOT);
    const { out } = await ok(fs, 'g', 'guide', '--dry-run', '--json', '--cwd', `${ROOT}/app`);
    const plan = JSON.parse(out) as { changes: { path: string; size?: number; contents?: string }[] };
    const font = plan.changes.find((c) => c.path === `src/guide/${FONT}`);
    expect(font).toEqual({ kind: 'create', path: `src/guide/${FONT}`, size: readFileSync(`${PACKAGE}${FONT}`).length });
  });
});
