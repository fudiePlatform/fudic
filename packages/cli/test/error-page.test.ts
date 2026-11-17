/**
 * SDD-87 §3.6, criteria 19, 21–23: `fudic g error-page` and `g app`, through the binary over a
 * memory disk. A library writes `src/_error.fud`, an app `src/routes/_error.fud`; one file and
 * nothing else; never twice without `--force`; and the report says who paints with it.
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

/** A workspace `shop` with a library `ui` and an app `admin`. */
async function shop(): Promise<MemoryFs> {
  const fs = new MemoryFs({}, ROOT);
  await ok(fs, 'new', 'shop', '--workspace', '--no-install', '--no-git', '--cwd', ROOT);
  await ok(fs, 'g', 'lib', 'ui', '--cwd', SHOP);
  await ok(fs, 'g', 'app', 'admin', '--cwd', SHOP);
  return fs;
}

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
    // The project's first language, as `g page` writes it.
    expect(fs.at('shop/libs/ui/src/_error.fud')).toBe(renderTemplate('_error.fud', { lang: 'en' }));
  });

  it('in an app writes src/routes/_error.fud', async () => {
    const fs = await shop();
    const { files } = await added(fs, 'g', 'error-page', '--project', 'admin', '--cwd', SHOP);
    expect(files).toEqual(['shop/apps/admin/src/routes/_error.fud']);
  });

  it('from inside the project, without --project', async () => {
    const fs = await shop();
    const { files } = await added(fs, 'g', 'error-page', '--cwd', `${SHOP}/libs/ui`);
    expect(files).toEqual(['shop/libs/ui/src/_error.fud']);
  });

  it('takes --project and --force, and nothing it does not know', () => {
    expect(parseArgs(['g', 'error-page', '--project', 'ui', '--force'])).toMatchObject({ kind: 'error-page', opts: { project: 'ui', force: true } });
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
    expect(fs.at('shop/libs/ui/src/_error.fud')).toBe(renderTemplate('_error.fud', { lang: 'en' }));
  });
});

describe('the report (criterion 22)', () => {
  it('in a library: every app that depends on it and has none of its own paints with it', async () => {
    const fs = await shop();
    const { ran } = await added(fs, 'g', 'error-page', '--project', 'ui', '--cwd', SHOP);
    expect(ran.out).toContain('Created src/_error.fud in libs/ui');
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
