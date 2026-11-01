/**
 * SDD-71 criteria 3 and 4 and §3.6: `--locale` in `new` and `g app`, and the `lang` of the
 * layout and the pages the CLI writes. Through `run()`, the same command lines a user types.
 */

import { describe, expect, it } from 'vitest';
import { run } from '../src/run.js';
import { captureStreams, MemoryFs, RecordingRunner } from './helpers.js';

const ROOT = '/w';

async function cli(fs: MemoryFs, ...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const capture = captureStreams();
  const code = await run(argv, { readIo: fs, writeIo: fs, runner: new RecordingRunner(), streams: capture.streams });
  return { code, out: capture.stdout(), err: capture.stderr() };
}

const json = (fs: MemoryFs, path: string): Record<string, unknown> => JSON.parse(fs.at(path)) as Record<string, unknown>;
const lang = (fs: MemoryFs, path: string): string | undefined => /<html lang="([^"]*)"/u.exec(fs.at(path))?.[1];

describe('criterion 3: fudic new --locale', () => {
  it('--locale es writes "locales": ["es"] and lang="es" in the layout and the home page', async () => {
    const fs = new MemoryFs({}, ROOT);
    expect((await cli(fs, 'new', 'tienda', '--locale', 'es', '--no-install', '--no-git', '--cwd', ROOT)).code).toBe(0);
    expect(json(fs, 'tienda/fudic.json')['locales']).toEqual(['es']);
    expect(lang(fs, 'tienda/src/layouts/_layout.fud')).toBe('es');
  });

  it('without a layout, the home page is the whole document and carries the lang', async () => {
    const fs = new MemoryFs({}, ROOT);
    await cli(fs, 'new', 'tienda', '--locale', 'es', '--no-layout', '--no-install', '--no-git', '--cwd', ROOT);
    expect(lang(fs, 'tienda/src/routes/index.fud')).toBe('es');
  });

  it('the tag is canonicalized: --locale ES-es is es-ES', async () => {
    const fs = new MemoryFs({}, ROOT);
    await cli(fs, 'new', 'tienda', '--locale', 'ES-es', '--no-install', '--no-git', '--cwd', ROOT);
    expect(json(fs, 'tienda/fudic.json')['locales']).toEqual(['es-ES']);
  });

  it('without it the fudic.json has no key, and the lang is en', async () => {
    const fs = new MemoryFs({}, ROOT);
    await cli(fs, 'new', 'tienda', '--no-install', '--no-git', '--cwd', ROOT);
    expect(json(fs, 'tienda/fudic.json')).not.toHaveProperty('locales');
    expect(lang(fs, 'tienda/src/layouts/_layout.fud')).toBe('en');
  });

  it('--locale es_ES! is FUD0725 with problem flag, and writes nothing', async () => {
    const fs = new MemoryFs({}, ROOT);
    const { code, out } = await cli(fs, 'new', 'tienda', '--locale', 'es_ES!', '--no-install', '--no-git', '--cwd', ROOT);
    expect(code).toBe(1);
    expect(out).toContain('FUD0725');
    expect(out).toContain('--locale "es_ES!" is not usable in fudic.json: it must match a BCP 47 tag');
    expect(fs.exists(`${ROOT}/tienda/fudic.json`)).toBe(false);
  });

  it('a workspace takes it for its app, and refuses it with no --app', async () => {
    const fs = new MemoryFs({}, ROOT);
    await cli(fs, 'new', 'shop', '--workspace', '--app', 'web', '--locale', 'es', '--no-install', '--no-git', '--cwd', ROOT);
    expect(json(fs, 'shop/apps/web/fudic.json')['locales']).toEqual(['es']);
    expect(lang(fs, 'shop/apps/web/src/layouts/_layout.fud')).toBe('es');

    const bare = new MemoryFs({}, ROOT);
    const { code, err } = await cli(bare, 'new', 'shop', '--workspace', '--locale', 'es', '--no-install', '--no-git', '--cwd', ROOT);
    expect(code).toBe(1);
    expect(err).toContain('--locale');
  });
});

describe('criterion 3: g app and g lib', () => {
  async function workspace(): Promise<MemoryFs> {
    const fs = new MemoryFs({}, ROOT);
    await cli(fs, 'new', 'shop', '--workspace', '--no-install', '--no-git', '--cwd', ROOT);
    return fs;
  }

  it('g app admin --locale fr does what new does', async () => {
    const fs = await workspace();
    expect((await cli(fs, 'g', 'app', 'admin', '--locale', 'fr', '--cwd', `${ROOT}/shop`)).code).toBe(0);
    expect(json(fs, 'shop/apps/admin/fudic.json')['locales']).toEqual(['fr']);
    expect(lang(fs, 'shop/apps/admin/src/layouts/_layout.fud')).toBe('fr');
  });

  it('g app with a bad tag is FUD0725 with problem flag', async () => {
    const fs = await workspace();
    const { code, out } = await cli(fs, 'g', 'app', 'admin', '--locale', 'xx-?', '--cwd', `${ROOT}/shop`);
    expect(code).toBe(1);
    expect(out).toContain('FUD0725');
  });

  it('g lib --locale es is an unknown flag: a library has no language', async () => {
    const fs = await workspace();
    const { code, err } = await cli(fs, 'g', 'lib', 'ui', '--locale', 'es', '--cwd', `${ROOT}/shop`);
    expect(code).toBe(1);
    expect(err).toContain('unknown flag --locale');
  });
});

describe('criterion 4: g layout and g page take the project\'s first language', () => {
  async function app(locales?: readonly string[]): Promise<MemoryFs> {
    const fs = new MemoryFs({}, ROOT);
    await cli(fs, 'new', 'tienda', '--no-install', '--no-git', '--cwd', ROOT);
    if (locales !== undefined) {
      const config = json(fs, 'tienda/fudic.json');
      fs.write(`${ROOT}/tienda/fudic.json`, JSON.stringify({ ...config, locales }));
    }
    return fs;
  }

  it('with "locales": ["fr", "en"] they write lang="fr"', async () => {
    const fs = await app(['fr', 'en']);
    await cli(fs, 'g', 'layout', 'docs', '--cwd', `${ROOT}/tienda`);
    await cli(fs, 'g', 'page', 'about', '--no-layout', '--cwd', `${ROOT}/tienda`);
    expect(lang(fs, 'tienda/src/layouts/docs.fud')).toBe('fr');
    expect(lang(fs, 'tienda/src/routes/about.fud')).toBe('fr');
  });

  it('without locales, DEFAULT_LOCALE', async () => {
    const fs = await app();
    await cli(fs, 'g', 'layout', 'docs', '--cwd', `${ROOT}/tienda`);
    expect(lang(fs, 'tienda/src/layouts/docs.fud')).toBe('en');
  });
});
