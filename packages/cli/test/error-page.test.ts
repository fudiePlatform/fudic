/**
 * SDD-87 §3.6, criteria 19, 21–23, and SDD-88 §3.3, criteria 16–17: `fudic g error-page` and
 * `g app`, through the binary over a memory disk. A library writes `src/_error.fud`, an app
 * `src/routes/_error.fud`; one file and nothing else; never twice without `--force`; the report
 * says who paints with it; and the page is a route that links a layout — the one `g page` would
 * pick in an app, the library's own in a library, or `--layout` — and with none to link it writes
 * nothing (FUD1582).
 */

import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args.js';
import { run } from '../src/run.js';
import { renderTemplate } from '../src/templates.js';
import { captureStreams, MemoryFs, RecordingRunner } from './helpers.js';

const ROOT = '/w';
const SHOP = `${ROOT}/shop`;

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

const deps = (fs: MemoryFs, path: string): Record<string, string> =>
  ((JSON.parse(fs.at(path)) as Record<string, unknown>)['dependencies'] ?? {}) as Record<string, string>;

/** A workspace `shop` with a library `ui` (with its layout, unless `layout` is false) and an app `admin`. */
async function shop(layout = true): Promise<MemoryFs> {
  const fs = new MemoryFs({}, ROOT);
  await ok(fs, 'new', 'shop', '--workspace', '--no-install', '--no-git', '--cwd', ROOT);
  await ok(fs, 'g', 'lib', 'ui', '--cwd', SHOP);
  if (layout) await ok(fs, 'g', 'layout', '_layout', '--project', 'ui', '--cwd', SHOP);
  await ok(fs, 'g', 'app', 'admin', '--cwd', SHOP);
  return fs;
}

/** The page `g error-page` writes, linking `layoutHref`. */
const PAGE = (layoutHref: string): string => renderTemplate('_error.fud', { layoutHref });

/** What one command added to the disk. */
async function added(fs: MemoryFs, ...argv: string[]): Promise<{ readonly ran: Ran; readonly files: readonly string[] }> {
  const before = new Set(fs.paths());
  const ran = await ok(fs, ...argv);
  return { ran, files: fs.paths().filter((p) => !before.has(p)) };
}

describe('fudic g error-page (criterion 19)', () => {
  it('in a library writes src/_error.fud and nothing else, without FUD0783', async () => {
    const fs = await shop();
    const { ran, files } = await added(fs, 'g', 'error-page', '--project', 'ui', '--cwd', SHOP);
    expect(files).toEqual(['shop/libs/ui/src/_error.fud']);
    expect(ran.out + ran.err).not.toContain('FUD0783');
    // A route that links the library's own layout (SDD-88 criterion 16).
    expect(fs.at('shop/libs/ui/src/_error.fud')).toBe(PAGE('./layouts/_layout.fud'));
  });

  it('in an app writes src/routes/_error.fud, linking the layout g page would pick (SDD-88 criterion 16)', async () => {
    const fs = await shop();
    const { files } = await added(fs, 'g', 'error-page', '--project', 'admin', '--cwd', SHOP);
    expect(files).toEqual(['shop/apps/admin/src/routes/_error.fud']);
    expect(fs.at('shop/apps/admin/src/routes/_error.fud')).toBe(PAGE('../layouts/_layout.fud'));
  });

  it('in an app, the nearest _layout.fud wins over src/layouts, as for g page', async () => {
    const fs = await shop();
    fs.write(`${SHOP}/apps/admin/src/routes/_layout.fud`, fs.at('shop/apps/admin/src/layouts/_layout.fud'));
    await ok(fs, 'g', 'error-page', '--project', 'admin', '--cwd', SHOP);
    expect(fs.at('shop/apps/admin/src/routes/_error.fud')).toBe(PAGE('./_layout.fud'));
  });

  it('from inside the project, without --project', async () => {
    const fs = await shop();
    const { files } = await added(fs, 'g', 'error-page', '--cwd', `${SHOP}/libs/ui`);
    expect(files).toEqual(['shop/libs/ui/src/_error.fud']);
  });

  it('takes --project, --layout and --force, and nothing it does not know', () => {
    expect(parseArgs(['g', 'error-page', '--project', 'ui', '--force'])).toMatchObject({ kind: 'error-page', opts: { project: 'ui', force: true } });
    expect(parseArgs(['g', 'error-page', '--layout', 'src/layouts/x.fud'])).toMatchObject({ kind: 'error-page', opts: { layout: 'src/layouts/x.fud' } });
    expect(parseArgs(['g', 'error-page'])).not.toHaveProperty('opts.layout');
    expect(parseArgs(['g', 'error-page', '--frob'])).toMatchObject({ kind: 'error' });
  });
});

describe('when the file is there (criterion 21)', () => {
  it('refuses, and with --force writes it again', async () => {
    const fs = await shop();
    await ok(fs, 'g', 'error-page', '--project', 'ui', '--cwd', SHOP);
    fs.write(`${SHOP}/libs/ui/src/_error.fud`, 'mine');
    const again = await cli(fs, 'g', 'error-page', '--project', 'ui', '--cwd', SHOP);
    expect(again.code).not.toBe(0);
    expect(again.out + again.err).toContain('FUD0443');
    expect(fs.at('shop/libs/ui/src/_error.fud')).toBe('mine');
    await ok(fs, 'g', 'error-page', '--project', 'ui', '--force', '--cwd', SHOP);
    expect(fs.at('shop/libs/ui/src/_error.fud')).toBe(PAGE('./layouts/_layout.fud'));
  });
});

describe('with no layout to link (SDD-88 criterion 16)', () => {
  it('a library without src/layouts/_layout.fud: FUD1582, naming the command with --project, and nothing written', async () => {
    const fs = await shop(false);
    const before = fs.paths();
    const ran = await cli(fs, 'g', 'error-page', '--project', 'ui', '--cwd', SHOP);
    expect(ran.code).not.toBe(0);
    expect(ran.out + ran.err).toContain('FUD1582');
    expect(ran.out + ran.err).toContain('libs/ui/src/layouts/_layout.fud');
    expect(ran.out + ran.err).toContain('fudic g layout _layout --project ui');
    expect(fs.paths()).toEqual(before);
  });

  it('from inside the library, the command it names needs no --project', async () => {
    const fs = await shop(false);
    const ran = await cli(fs, 'g', 'error-page', '--cwd', `${SHOP}/libs/ui`);
    expect(ran.out + ran.err).toContain('create one with `fudic g layout _layout` or pick one with --layout');
    expect(fs.exists(`${SHOP}/libs/ui/src/_error.fud`)).toBe(false);
  });

  it('an app without any layout: FUD1582, and nothing written', async () => {
    const fs = await shop();
    for (const file of fs.paths().filter((p) => p.startsWith('shop/apps/admin/src/layouts/'))) fs.remove(`${ROOT}/${file}`);
    fs.write(`${SHOP}/apps/admin/src/routes/index.fud`, '<h1>x</h1>\n');
    const before = fs.paths();
    const ran = await cli(fs, 'g', 'error-page', '--project', 'admin', '--cwd', SHOP);
    expect(ran.code).not.toBe(0);
    expect(ran.out + ran.err).toContain('FUD1582');
    expect(ran.out + ran.err).toContain('fudic g layout _layout --project admin');
    expect(fs.paths()).toEqual(before);
  });
});

describe('--layout (SDD-88 criterion 17)', () => {
  it('links the layout it names, by path', async () => {
    const fs = await shop();
    fs.write(`${SHOP}/apps/admin/src/layouts/_bare.fud`, fs.at('shop/apps/admin/src/layouts/_layout.fud'));
    await ok(fs, 'g', 'error-page', '--project', 'admin', '--layout', 'apps/admin/src/layouts/_bare.fud', '--cwd', SHOP);
    expect(fs.at('shop/apps/admin/src/routes/_error.fud')).toBe(PAGE('../layouts/_bare.fud'));
  });

  it("a library's layout by its package specifier, written as the specifier", async () => {
    const fs = await shop();
    const { ran } = await added(fs, 'g', 'error-page', '--project', 'admin', '--layout', '@shop/ui/layouts/_layout.fud', '--cwd', SHOP);
    expect(fs.at('shop/apps/admin/src/routes/_error.fud')).toBe(PAGE('@shop/ui/layouts/_layout.fud'));
    expect(ran.out).toContain('  layout     @shop/ui/layouts/_layout.fud');
  });

  it('in a library too, over its own layout', async () => {
    const fs = await shop();
    fs.write(`${SHOP}/libs/ui/src/layouts/_plain.fud`, fs.at('shop/libs/ui/src/layouts/_layout.fud'));
    await ok(fs, 'g', 'error-page', '--project', 'ui', '--layout', 'libs/ui/src/layouts/_plain.fud', '--cwd', SHOP);
    expect(fs.at('shop/libs/ui/src/_error.fud')).toBe(PAGE('./layouts/_plain.fud'));
  });

  it('an href that is not a layout: FUD0449, and nothing written', async () => {
    const fs = await shop();
    for (const href of ['apps/admin/src/routes/index.fud', 'apps/admin/src/layouts/_nope.fud', '@shop/ui/layouts/_nope.fud']) {
      const ran = await cli(fs, 'g', 'error-page', '--project', 'admin', '--layout', href, '--cwd', SHOP);
      expect(ran.code, href).not.toBe(0);
      expect(ran.out + ran.err, href).toContain('FUD0449');
      expect(fs.exists(`${SHOP}/apps/admin/src/routes/_error.fud`)).toBe(false);
    }
  });

  it('a whole document without a hole is no layout to link: FUD0449', async () => {
    const fs = await shop();
    fs.write(`${SHOP}/apps/admin/src/layouts/_whole.fud`, '<!DOCTYPE html>\n<html><head></head><body><p>x</p></body></html>\n');
    const ran = await cli(fs, 'g', 'error-page', '--project', 'admin', '--layout', 'apps/admin/src/layouts/_whole.fud', '--cwd', SHOP);
    expect(ran.out + ran.err).toContain('FUD0449');
    expect(fs.exists(`${SHOP}/apps/admin/src/routes/_error.fud`)).toBe(false);
  });
});

describe('the report (criterion 22)', () => {
  it('in a library: every app that depends on it and has none of its own paints with it', async () => {
    const fs = await shop();
    const { ran } = await added(fs, 'g', 'error-page', '--project', 'ui', '--cwd', SHOP);
    expect(ran.out).toContain('Created src/_error.fud in libs/ui');
    expect(ran.out).toContain('  layout     ./layouts/_layout.fud');
    expect(ran.out).toContain('every app that depends on @shop/ui and has no _error.fud of its own paints with it');
  });

  it('in an app whose chain already brings one: this one replaces it', async () => {
    const fs = await shop();
    await ok(fs, 'g', 'error-page', '--project', 'ui', '--cwd', SHOP);
    // `admin` with `ui` installed as an install leaves it, a copy under its node_modules.
    const installed = `${SHOP}/apps/admin/node_modules/@shop/ui`;
    for (const file of ['package.json', 'fudic.json', 'src/_error.fud']) fs.write(`${installed}/${file}`, fs.at(`shop/libs/ui/${file}`));
    fs.write(`${SHOP}/apps/admin/package.json`, JSON.stringify({ ...JSON.parse(fs.at('shop/apps/admin/package.json')), dependencies: { '@shop/ui': 'workspace:*' } }));
    const { ran } = await added(fs, 'g', 'error-page', '--project', 'admin', '--cwd', SHOP);
    expect(ran.out).toContain('it replaces the one of @shop/ui in this app');
  });

  it('in an app whose chain brings none: no such line', async () => {
    const fs = await shop();
    const { ran } = await added(fs, 'g', 'error-page', '--project', 'admin', '--cwd', SHOP);
    expect(ran.out).toContain('Created src/routes/_error.fud in apps/admin');
    expect(ran.out).toContain('  layout     ../layouts/_layout.fud');
    expect(ran.out).not.toContain('replaces');
    expect(ran.out).not.toContain('every app');
  });
});

describe('g app brings the libraries with an error page (criterion 23)', () => {
  it('a library with src/_error.fud and no guide is a dependency of the new app; one without, not', async () => {
    const fs = await shop();
    await ok(fs, 'g', 'lib', 'marketing', '--cwd', SHOP);
    await ok(fs, 'g', 'error-page', '--project', 'ui', '--cwd', SHOP);
    await ok(fs, 'g', 'app', 'pedidos', '--cwd', SHOP);
    const pedidos = deps(fs, 'shop/apps/pedidos/package.json');
    expect(pedidos).toMatchObject({ '@shop/ui': 'workspace:*' });
    expect(pedidos).not.toHaveProperty('@shop/marketing');
  });

  it('g lib does not: a library does not paint errors', async () => {
    const fs = await shop();
    await ok(fs, 'g', 'error-page', '--project', 'ui', '--cwd', SHOP);
    await ok(fs, 'g', 'lib', 'tablas', '--cwd', SHOP);
    expect(deps(fs, 'shop/libs/tablas/package.json')).not.toHaveProperty('@shop/ui');
  });
});
