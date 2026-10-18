/**
 * `fudic g snippet <file> <name>`: the first snippet creates the file and its test, the next ones
 * go to their end, and the command says the `<link rel="snippet">` and the `@render` to write —
 * by the package's name in a library. Read from what the binary writes and prints.
 */

import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args.js';
import { run } from '../src/run.js';
import { captureStreams, MemoryFs, RecordingRunner } from './helpers.js';

const ROOT = '/w';
const SHOP = `${ROOT}/shop`;
const UI = 'shop/libs/ui/src/snippets';
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
  expect((await cli(fs, 'new', 'shop', '--workspace', '--app', 'web', '--uses', 'ui', '--cwd', ROOT)).code).toBe(0);
  return fs;
}

describe('fudic g snippet in a library', () => {
  it('creates the file and its test, and says how an app uses it — exactly', async () => {
    const fs = await shop();
    const { code, out } = await cli(fs, 'g', 'snippet', 'ui', 'productCard', '--project', 'ui', '--cwd', SHOP);
    expect(code).toBe(0);
    expect(out).toBe(`
Created snippet productCard in libs/ui/src/snippets/ui.fud

  ui.fud                  the snippet file
  ui.test.ts              unit test               pnpm --filter ui test

Use it from a page or a component of an app that uses this library
  <link rel="snippet" href="@shop/ui/snippets/ui.fud">
  @render productCard()
`);
    expect(fs.at(`${UI}/ui.fud`)).toBe('@snippet productCard() {\n  <div class="productCard"></div>\n}\n');
    expect(fs.at(`${UI}/ui.test.ts`)).toBe(`import { expect, test } from 'vitest';
import { renderSnippet } from '@fudic/testing';

test('productCard renders', async () => {
  const t = await renderSnippet('./ui.fud', 'productCard()');
  expect(t.query('.productCard')).toBeInTheDocument();
});
`);
  });

  it('adds the next one to the end of the file, and its case to the test', async () => {
    const fs = await shop();
    await cli(fs, 'g', 'snippet', 'ui', 'productCard', '--project', 'ui', '--cwd', SHOP);
    const { out } = await cli(fs, 'g', 'snippet', 'ui', 'priceTag', '--project', 'ui', '--cwd', SHOP);
    expect(out).toContain('Added snippet priceTag in libs/ui/src/snippets/ui.fud');
    expect(out).toContain('  ui.fud                  the snippet, at the end of the file\n');
    expect(fs.at(`${UI}/ui.fud`)).toBe(
      '@snippet productCard() {\n  <div class="productCard"></div>\n}\n\n@snippet priceTag() {\n  <div class="priceTag"></div>\n}\n',
    );
    const test = fs.at(`${UI}/ui.test.ts`);
    expect(test.match(/renderSnippet\('/gu)).toHaveLength(2);
    expect(test).toContain("test('priceTag renders'");
  });

  it('gives a test file started by hand the import its case needs', async () => {
    const fs = await shop();
    await cli(fs, 'g', 'snippet', 'ui', 'productCard', '--project', 'ui', '--skip-test', '--cwd', SHOP);
    fs.write(`${SHOP}/libs/ui/src/snippets/ui.test.ts`, "import { test } from 'vitest';\n");
    await cli(fs, 'g', 'snippet', 'ui', 'priceTag', '--project', 'ui', '--cwd', SHOP);
    expect(fs.at(`${UI}/ui.test.ts`)).toMatch(/^import \{ renderSnippet \} from '@fudic\/testing';\nimport \{ test \} from 'vitest';\n\ntest\('priceTag renders'/u);
  });

  it('--skip-test writes no test', async () => {
    const fs = await shop();
    const { out } = await cli(fs, 'g', 'snippet', 'ui', 'productCard', '--project', 'ui', '--skip-test', '--cwd', SHOP);
    expect(out).not.toContain('unit test');
    expect(fs.paths()).not.toContain(`${UI}/ui.test.ts`);
  });

  it('gives a library made before the rule its snippets rule', async () => {
    const fs = await shop();
    const manifest = JSON.parse(fs.read(MANIFEST)) as { exports: Record<string, string> };
    delete manifest.exports['./snippets/*.fud'];
    fs.write(MANIFEST, JSON.stringify(manifest, null, 2));
    const { out } = await cli(fs, 'g', 'snippet', 'ui', 'productCard', '--project', 'ui', '--cwd', SHOP);
    expect(out).toContain('  package.json            exports ./snippets/*.fud, so apps can link it\n');
    expect(out).toContain('  <link rel="snippet" href="@shop/ui/snippets/ui.fud">\n');
    expect((JSON.parse(fs.read(MANIFEST)) as { exports: Record<string, string> }).exports['./snippets/*.fud']).toBe('./src/snippets/*.fud');
  });

  it('says a file outside src/snippets is not linkable, and leaves exports alone', async () => {
    const fs = await shop();
    const before = fs.read(MANIFEST);
    const { out } = await cli(fs, 'g', 'snippet', 'ui', 'productCard', '--project', 'ui', '--dir', 'src/parts', '--cwd', SHOP);
    expect(out).toContain('Created snippet productCard in libs/ui/src/parts/ui.fud');
    expect(out).toContain('No app can link it yet: add its folder to "exports" in package.json');
    expect(fs.read(MANIFEST)).toBe(before);
  });
});

describe('fudic g snippet in an app', () => {
  it('says the path a page of src/routes writes', async () => {
    const fs = await shop();
    const { out } = await cli(fs, 'g', 'snippet', 'fields', 'textField', '--project', 'web', '--cwd', SHOP);
    expect(out).toContain('Created snippet textField in apps/web/src/snippets/fields.fud');
    expect(out).toContain('  fields.test.ts          unit test               pnpm --filter web test\n');
    expect(out).toContain('Use it from a page of src/routes\n  <link rel="snippet" href="../snippets/fields.fud">\n  @render textField()\n');
  });

  it('outside a workspace, runs its test with pnpm test', async () => {
    const fs = new MemoryFs({}, ROOT);
    await cli(fs, 'new', 'solo', '--no-install', '--no-git', '--cwd', ROOT);
    const { out } = await cli(fs, 'g', 'snippet', 'ui', 'card', '--cwd', `${ROOT}/solo`);
    expect(out).toContain('  ui.test.ts              unit test               pnpm test\n');
  });
});

describe('what g snippet refuses', () => {
  it.each([
    ['a snippet name with a hyphen', ['ui', 'product-card'], 'invalid snippet name "product-card"'],
    ['a file name that is not kebab-case', ['Ui', 'card'], 'invalid snippet file "Ui"'],
  ])('%s (FUD0458), writing nothing', async (_what, args, message) => {
    const fs = await shop();
    const before = fs.paths();
    const { code, out } = await cli(fs, 'g', 'snippet', ...args, '--project', 'ui', '--cwd', SHOP);
    expect(code).toBe(1);
    expect(out).toContain('FUD0458');
    expect(out).toContain(message);
    expect(fs.paths()).toEqual(before);
  });

  it('a name the file already declares (FUD0459)', async () => {
    const fs = await shop();
    await cli(fs, 'g', 'snippet', 'ui', 'productCard', '--project', 'ui', '--cwd', SHOP);
    const before = fs.at(`${UI}/ui.fud`);
    const { code, out } = await cli(fs, 'g', 'snippet', 'ui', 'productCard', '--project', 'ui', '--cwd', SHOP);
    expect(code).toBe(1);
    expect(out).toContain('already declares the snippet "productCard"');
    expect(fs.at(`${UI}/ui.fud`)).toBe(before);
  });

  it('a file that is not a file of snippets (FUD0459)', async () => {
    const fs = await shop();
    fs.write(`${SHOP}/libs/ui/src/snippets/ui.fud`, '<ui-x>\n  <template shadowrootmode="open"></template>\n</ui-x>\n');
    const { code, out } = await cli(fs, 'g', 'snippet', 'ui', 'card', '--project', 'ui', '--cwd', SHOP);
    expect(code).toBe(1);
    expect(out).toContain('is not a snippet file');
  });

  it('a project that is not there', async () => {
    const fs = await shop();
    expect((await cli(fs, 'g', 'snippet', 'ui', 'card', '--project', 'nope', '--cwd', SHOP)).code).toBe(1);
  });

  it('a call with no snippet name, saying how to go on', () => {
    const parsed = parseArgs(['g', 'snippet', 'ui']);
    expect(parsed.kind).toBe('error');
    expect(parsed.kind === 'error' && parsed.hints).toEqual(['e.g. fudic g snippet ui productCard']);
  });

  it('an option it does not take', () => {
    expect(parseArgs(['g', 'snippet', 'ui', 'card', '--sections', 'x']).kind).toBe('error');
  });
});
