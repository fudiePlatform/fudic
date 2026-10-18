/**
 * What a workspace starts with, and where an app's pages take their frame from (decision of
 * Pedro, 2026-10-18): a workspace empty, with an app, with libraries or with both; an app with
 * its own layout, a library's or none; a page in the layout it names, the nearest one, or the
 * one its home page renders inside.
 */

import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../src/args.js';
import { run } from '../../src/run.js';
import { captureStreams, MemoryFs, RecordingRunner } from '../helpers.js';

const ROOT = '/w';
const SHOP = `${ROOT}/shop`;
const MAIN = '@shop/ui/layouts/main.fud';

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

/** An empty workspace, a library `ui` and its layout `main`. */
async function withLibraryLayout(): Promise<MemoryFs> {
  const fs = new MemoryFs({}, ROOT);
  expect((await cli(fs, 'new', 'shop', '--workspace', '--cwd', ROOT)).code).toBe(0);
  expect((await cli(fs, 'g', 'lib', 'ui', '--cwd', SHOP)).code).toBe(0);
  expect((await cli(fs, 'g', 'layout', 'main', '--project', 'ui', '--cwd', SHOP)).code).toBe(0);
  return fs;
}

const files = (fs: MemoryFs, under: string): readonly string[] => fs.paths().filter((path) => path.startsWith(under));

describe('fudic new --workspace: what it starts with', () => {
  it('without --app or --lib, nothing — and it says what comes next, exactly', async () => {
    const fs = new MemoryFs({}, ROOT);
    const { code, out } = await cli(fs, 'new', 'shop', '--workspace', '--cwd', ROOT);
    expect(code).toBe(0);
    expect(out).toBe(`
Created workspace shop

  shop/
    README.md          what apps/ and libs/ are, and the commands below
    apps/              empty — fudic g app <name>
    libs/              empty — fudic g lib <name>

  Installed dependencies (pnpm)
  Committed: "chore: create workspace shop"

Next
  cd shop
  fudic g lib ui                         a component library
  fudic g app web                        the first app, served at /
  pnpm test          unit tests of every project
  pnpm spec          .fudspec criteria of every project
`);
    expect(files(fs, 'shop/apps/')).toEqual(['shop/apps/.gitkeep']);
    expect(files(fs, 'shop/libs/')).toEqual(['shop/libs/.gitkeep']);
  });

  it('with --lib, that library and no app', async () => {
    const fs = new MemoryFs({}, ROOT);
    const { out } = await cli(fs, 'new', 'shop', '--workspace', '--lib', 'ui', '--cwd', ROOT);
    expect(out).toContain('    libs/ui/           library ui\n');
    expect(out).toContain('  fudic g app web --uses ui              the first app, served at /\n');
    expect(fs.paths()).toContain('shop/libs/ui/fudic.json');
    expect(fs.paths()).not.toContain('shop/libs/.gitkeep');
  });

  it('with --app, --uses and --lib, the app and every library, saying which it uses', async () => {
    const fs = new MemoryFs({}, ROOT);
    const { out } = await cli(fs, 'new', 'shop', '--workspace', '--app', 'web', '--uses', 'ui', '--lib', 'guia', '--cwd', ROOT);
    expect(out).toContain('    libs/ui/           library ui, used by web\n');
    expect(out).toContain('    libs/guia/         library guia\n');
    expect(out).toContain('  pnpm dev           http://localhost:5173/\n');
    expect(fs.paths()).not.toContain('shop/apps/.gitkeep');
  });

  it.each(['--uses ui', '--layout shell', '--no-layout'])('refuses %s without --app', (flags) => {
    const parsed = parseArgs(['new', 'shop', '--workspace', ...flags.split(' ')]);
    expect(parsed.kind).toBe('error');
  });

  it('refuses --lib without --workspace', () => {
    expect(parseArgs(['new', 'solo', '--lib', 'ui']).kind).toBe('error');
  });
});

describe('fudic g app: its frame', () => {
  it('--layout <href> renders its home inside the library layout, uses the library and owns no layout', async () => {
    const fs = await withLibraryLayout();
    const { code, out } = await cli(fs, 'g', 'app', 'web', '--layout', MAIN, '--cwd', SHOP);
    expect(code).toBe(0);
    expect(out).toContain('  uses       ui\n  layout     @shop/ui/layouts/main.fud\n');
    expect(fs.at('shop/apps/web/src/routes/index.fud').split('\n')[0]).toBe(`<link rel="layout" href="${MAIN}">`);
    expect(fs.at('shop/apps/web/package.json')).toContain('"@shop/ui": "workspace:*"');
    expect(files(fs, 'shop/apps/web/src/layouts/')).toEqual([]);
    expect(fs.at('shop/apps/web/README.md')).toContain(`- \`${MAIN}\`: the layout every page is written into; it is not this app's.`);
  });

  it('does not name the library twice when --uses already does', async () => {
    const fs = await withLibraryLayout();
    const { out } = await cli(fs, 'g', 'app', 'web', '--uses', 'ui', '--layout', MAIN, '--cwd', SHOP);
    expect(out).toContain('  uses       ui\n');
  });

  it('refuses an href that names no layout of the workspace (FUD0449)', async () => {
    const fs = await withLibraryLayout();
    const { code, out: err } = await cli(fs, 'g', 'app', 'web', '--layout', '@shop/ui/layouts/nope.fud', '--cwd', SHOP);
    expect(code).toBe(1);
    expect(err).toContain('FUD0449');
    expect(fs.paths()).not.toContain('shop/apps/web/fudic.json');
  });

  it('--no-layout makes its home a whole document', async () => {
    const fs = await withLibraryLayout();
    const { out } = await cli(fs, 'g', 'app', 'web', '--no-layout', '--cwd', SHOP);
    expect(out).toContain('  layout     none: each page is a whole document\n');
    expect(fs.at('shop/apps/web/src/routes/index.fud')).toMatch(/^<!DOCTYPE html>/u);
    expect(fs.at('shop/apps/web/README.md')).toContain('- No layout: each page is a whole document. `fudic g layout <name>` adds one.');
  });

  it('--layout <name> gives it a layout of its own under that name', async () => {
    const fs = await withLibraryLayout();
    const { out } = await cli(fs, 'g', 'app', 'web', '--layout', 'shell', '--cwd', SHOP);
    expect(out).not.toContain('  layout ');
    expect(files(fs, 'shop/apps/web/src/layouts/')).toEqual(['shop/apps/web/src/layouts/shell.fud', 'shop/apps/web/src/layouts/shell.test.ts']);
    expect(fs.at('shop/apps/web/src/routes/index.fud').split('\n')[0]).toBe('<link rel="layout" href="../layouts/shell.fud">');
  });
});

describe('fudic g page: the layout it renders inside', () => {
  const firstLine = (fs: MemoryFs, page: string): string => fs.at(`shop/apps/web/src/routes/${page}`).split('\n')[0]!;

  it('with no layout of the app, the one its home page renders inside', async () => {
    const fs = await withLibraryLayout();
    await cli(fs, 'g', 'app', 'web', '--layout', MAIN, '--cwd', SHOP);
    await cli(fs, 'g', 'page', 'about', '--project', 'web', '--cwd', SHOP);
    expect(firstLine(fs, 'about.fud')).toBe(`<link rel="layout" href="${MAIN}">`);
  });

  it('a library layout by its href, given with --layout', async () => {
    const fs = await withLibraryLayout();
    await cli(fs, 'g', 'app', 'web', '--cwd', SHOP);
    await cli(fs, 'g', 'page', 'blog/:slug', '--project', 'web', '--layout', MAIN, '--cwd', SHOP);
    expect(firstLine(fs, 'blog/[slug].fud')).toBe(`<link rel="layout" href="${MAIN}">`);
  });

  it('the home page’s own layout when it is not called _layout', async () => {
    const fs = await withLibraryLayout();
    await cli(fs, 'g', 'app', 'web', '--layout', 'shell', '--cwd', SHOP);
    await cli(fs, 'g', 'page', 'blog/:slug', '--project', 'web', '--cwd', SHOP);
    expect(firstLine(fs, 'blog/[slug].fud')).toBe('<link rel="layout" href="../../layouts/shell.fud">');
  });

  it('a whole document when the home page has no layout either', async () => {
    const fs = await withLibraryLayout();
    await cli(fs, 'g', 'app', 'web', '--no-layout', '--cwd', SHOP);
    await cli(fs, 'g', 'page', 'about', '--project', 'web', '--cwd', SHOP);
    expect(firstLine(fs, 'about.fud')).toBe('<!DOCTYPE html>');
  });

  it.each([
    ['an empty href', '<link rel="layout" href="">'],
    ['an href to nothing', '<link rel="layout" href="../layouts/ghost.fud">'],
  ])('a whole document when the home page links %s', async (_what, link) => {
    const fs = await withLibraryLayout();
    await cli(fs, 'g', 'app', 'web', '--no-layout', '--cwd', SHOP);
    fs.write(`${SHOP}/apps/web/src/routes/index.fud`, `${link}\n<h1>Home</h1>\n`);
    await cli(fs, 'g', 'page', 'about', '--project', 'web', '--cwd', SHOP);
    expect(firstLine(fs, 'about.fud')).toBe('<!DOCTYPE html>');
  });

  it('refuses an href no project of the workspace maps (FUD0449)', async () => {
    const fs = await withLibraryLayout();
    await cli(fs, 'g', 'app', 'web', '--cwd', SHOP);
    for (const href of ['@nobody/ui/layouts/main.fud', '@shop/ui/nowhere.txt']) {
      const { code, out: err } = await cli(fs, 'g', 'page', 'about', '--project', 'web', '--layout', href, '--cwd', SHOP);
      expect(code, href).toBe(1);
      expect(err, href).toContain('FUD0449');
    }
  });

  it('refuses a library href outside a workspace (FUD0449)', async () => {
    const fs = new MemoryFs({}, ROOT);
    await cli(fs, 'new', 'solo', '--no-install', '--no-git', '--cwd', ROOT);
    const { code, out: err } = await cli(fs, 'g', 'page', 'about', '--layout', MAIN, '--cwd', `${ROOT}/solo`);
    expect(code).toBe(1);
    expect(err).toContain('FUD0449');
  });
});

describe('a library href read off its exports', () => {
  /** The library's `exports` replaced, then a page of `web` asked to render inside `href`. */
  async function pageWith(exports: unknown, href: string): Promise<{ readonly code: number; readonly fs: MemoryFs }> {
    const fs = await withLibraryLayout();
    await cli(fs, 'g', 'app', 'web', '--cwd', SHOP);
    const path = `${SHOP}/libs/ui/package.json`;
    const manifest = JSON.parse(fs.read(path)) as Record<string, unknown>;
    if (exports === undefined) delete manifest['exports'];
    else manifest['exports'] = exports;
    fs.write(path, JSON.stringify(manifest));
    const { code } = await cli(fs, 'g', 'page', 'about', '--project', 'web', '--layout', href, '--cwd', SHOP);
    return { code, fs };
  }

  it('maps every file when there is no exports', async () => {
    expect((await pageWith(undefined, '@shop/ui/src/layouts/main.fud')).code).toBe(0);
  });

  it('maps an exact key, and skips a conditional entry', async () => {
    const exports = { '.': { import: './index.js' }, './main.fud': './src/layouts/main.fud' };
    expect((await pageWith(exports, '@shop/ui/main.fud')).code).toBe(0);
  });

  it('picks the pattern with the longest prefix, in whatever order they are written', async () => {
    const exports = { './layouts/*.fud': './src/layouts/*.fud', './*.fud': './src/components/*/*.fud' };
    expect((await pageWith(exports, MAIN)).code).toBe(0);
  });

  it('maps nothing when exports is not an object', async () => {
    expect((await pageWith('./index.js', MAIN)).code).toBe(1);
  });
});
