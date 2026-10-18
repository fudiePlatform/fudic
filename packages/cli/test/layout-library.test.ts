/**
 * A layout an app can use: in a library, `exports` gives it a public name and `g layout` says
 * the `<link>` to write; in an app, it says the `<link>` a page writes. Read from what the
 * binary writes and prints, over the workspace of `fudic new shop --workspace` and `g lib ui`.
 */

import { describe, expect, it } from 'vitest';
import { run } from '../src/run.js';
import { captureStreams, MemoryFs, RecordingRunner } from './helpers.js';

const ROOT = '/w';
const SHOP = `${ROOT}/shop`;
const MANIFEST = `${SHOP}/libs/ui/package.json`;

interface Ran {
  readonly code: number;
  readonly out: string;
}

async function cli(fs: MemoryFs, ...argv: string[]): Promise<Ran> {
  const capture = captureStreams();
  const code = await run(argv, { readIo: fs, writeIo: fs, runner: new RecordingRunner(), streams: capture.streams });
  return { code, out: capture.stdout() };
}

async function shop(): Promise<MemoryFs> {
  const fs = new MemoryFs({}, ROOT);
  expect((await cli(fs, 'new', 'shop', '--workspace', '--app', 'web', '--cwd', ROOT)).code).toBe(0);
  expect((await cli(fs, 'g', 'lib', 'ui', '--cwd', SHOP)).code).toBe(0);
  return fs;
}

/** The library's manifest with `exports` replaced, as a library made by an older CLI has it. */
function withExports(fs: MemoryFs, exports: unknown): void {
  const manifest = JSON.parse(fs.read(MANIFEST)) as Record<string, unknown>;
  fs.write(MANIFEST, `${JSON.stringify({ ...manifest, exports }, null, 2)}\n`);
}

const OLD_EXPORTS = { './fudic.json': './fudic.json', './*.fud': './src/components/*/*.fud' };

describe('a new library exports its layouts', () => {
  it('has the layouts and snippets rules in its package.json from the start', async () => {
    const fs = await shop();
    expect((JSON.parse(fs.read(MANIFEST)) as { exports: unknown }).exports).toEqual({
      ...OLD_EXPORTS,
      './layouts/*.fud': './src/layouts/*.fud',
      './snippets/*.fud': './src/snippets/*.fud',
    });
  });

  it('g layout says the <link> an app writes, and leaves package.json alone', async () => {
    const fs = await shop();
    const before = fs.read(MANIFEST);
    const { code, out } = await cli(fs, 'g', 'layout', 'main', '--project', 'ui', '--cwd', SHOP);
    expect(code).toBe(0);
    expect(out).toBe(`
Created layout main in libs/ui/src/layouts/

  main.fud                the layout
  main.test.ts            unit test               pnpm --filter ui test

Use it from a page of an app that uses this library
  <link rel="layout" href="@shop/ui/layouts/main.fud">
`);
    expect(fs.read(MANIFEST)).toBe(before);
  });
});

describe('a library made before the rule', () => {
  it('gains the rule with its first layout, written into the text', async () => {
    const fs = await shop();
    withExports(fs, OLD_EXPORTS);
    const { out } = await cli(fs, 'g', 'layout', 'main', '--project', 'ui', '--cwd', SHOP);
    expect(out).toContain('  package.json            exports ./layouts/*.fud, so apps can link it\n');
    expect(out).toContain('  <link rel="layout" href="@shop/ui/layouts/main.fud">\n');
    expect(fs.read(MANIFEST)).toContain(`  "exports": {
    "./fudic.json": "./fudic.json",
    "./*.fud": "./src/components/*/*.fud",
    "./layouts/*.fud": "./src/layouts/*.fud"
  },`);
  });

  it('fills an empty exports object', async () => {
    const fs = await shop();
    withExports(fs, {});
    await cli(fs, 'g', 'layout', 'main', '--project', 'ui', '--cwd', SHOP);
    expect((JSON.parse(fs.read(MANIFEST)) as { exports: unknown }).exports).toEqual({ './layouts/*.fud': './src/layouts/*.fud' });
  });

  it('adds the rule after a conditional entry, inside the right braces', async () => {
    const fs = await shop();
    withExports(fs, { '.': { import: './index.js' }, './*.fud': './src/components/*/*.fud' });
    await cli(fs, 'g', 'layout', 'main', '--project', 'ui', '--cwd', SHOP);
    expect((JSON.parse(fs.read(MANIFEST)) as { exports: unknown }).exports).toEqual({
      '.': { import: './index.js' },
      './*.fud': './src/components/*/*.fud',
      './layouts/*.fud': './src/layouts/*.fud',
    });
  });

  it.each([['a string', './index.js'], ['null', null], ['an array', ['./index.js']]])(
    'does not touch an exports that is %s, and says the layout is not linkable',
    async (_kind, exports) => {
      const fs = await shop();
      withExports(fs, exports);
      const before = fs.read(MANIFEST);
      const { out } = await cli(fs, 'g', 'layout', 'main', '--project', 'ui', '--cwd', SHOP);
      expect(out).toContain('\nNo app can link it yet: add its folder to "exports" in package.json\n');
      expect(fs.read(MANIFEST)).toBe(before);
    },
  );

  it.each(['main.fud', 'main.test.ts'])('refuses to overwrite %s', async (existing) => {
    const fs = await shop();
    fs.write(`${SHOP}/libs/ui/src/layouts/${existing}`, '// mine\n');
    const { code } = await cli(fs, 'g', 'layout', 'main', '--project', 'ui', '--cwd', SHOP);
    expect(code).toBe(1);
    expect(fs.read(`${SHOP}/libs/ui/src/layouts/${existing}`)).toBe('// mine\n');
  });

  it('does not export a folder other than src/layouts', async () => {
    const fs = await shop();
    withExports(fs, OLD_EXPORTS);
    const before = fs.read(MANIFEST);
    const { out } = await cli(fs, 'g', 'layout', 'main', '--project', 'ui', '--dir', 'src/shells', '--cwd', SHOP);
    expect(out).toContain('Created layout main in libs/ui/src/shells/');
    expect(out).toContain('No app can link it yet');
    expect(fs.read(MANIFEST)).toBe(before);
  });
});

describe('a layout of an app', () => {
  it('says the <link> a page of src/routes writes', async () => {
    const fs = await shop();
    const { out } = await cli(fs, 'g', 'layout', 'docs', '--project', 'web', '--skip-test', '--cwd', SHOP);
    expect(out).toBe(`
Created layout docs in apps/web/src/layouts/

  docs.fud                the layout

Use it from a page of src/routes
  <link rel="layout" href="../layouts/docs.fud">
`);
  });

  it('outside a workspace, runs its test with pnpm test', async () => {
    const fs = new MemoryFs({}, ROOT);
    expect((await cli(fs, 'new', 'blog', '--cwd', ROOT, '--no-install', '--no-git')).code).toBe(0);
    const { out } = await cli(fs, 'g', 'layout', 'docs', '--cwd', `${ROOT}/blog`);
    expect(out).toContain('  docs.test.ts            unit test               pnpm test\n');
  });
});
