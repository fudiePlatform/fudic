/**
 * BUG-50 §4.2, §4.4, §4.8 — projects that test themselves from the first minute, with the
 * prefix of their name, and generated files that speak to the user and not about the compiler.
 *
 * The files are read from what the binary writes, through `run()`: the same command lines as
 * §6.2–§6.4, so a file that is right in a plan and wrong on disk is still wrong here.
 */

import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args.js';
import { FUDIC_VERSION, TYPESCRIPT_VERSION, VITE_VERSION, VITEST_VERSION } from '../src/project.js';
import { routeToUrl } from '../src/route.js';
import { run } from '../src/run.js';
import { prefixOf } from '../src/tag.js';
import { layoutTest, pageTest } from '../src/templates.js';
import { captureStreams, MemoryFs, RecordingRunner } from './helpers.js';

const ROOT = '/w';
const SHOP = `${ROOT}/shop`;

async function cli(fs: MemoryFs, ...argv: string[]): Promise<void> {
  const capture = captureStreams();
  const code = await run(argv, { readIo: fs, writeIo: fs, runner: new RecordingRunner(), streams: capture.streams });
  if (code !== 0) throw new Error(`fudic ${argv.join(' ')} exited ${code}:\n${capture.stdout()}${capture.stderr()}`);
}

/** §6.2–§6.4 as far as phase 2 goes, plus a page and a layout, and a standalone app. */
async function generated(): Promise<MemoryFs> {
  const fs = new MemoryFs({}, ROOT);
  await cli(fs, 'new', 'shop', '--workspace', '--app', 'web', '--cwd', ROOT);
  await cli(fs, 'g', 'lib', 'ui', '--cwd', SHOP);
  await cli(fs, 'g', 'app', 'admin', '--uses', 'ui', '--cwd', SHOP);
  await cli(fs, 'g', 'page', 'about', '--project', 'web', '--cwd', SHOP);
  await cli(fs, 'g', 'page', 'blog/:slug', '--project', 'web', '--cwd', SHOP);
  await cli(fs, 'g', 'layout', 'docs-shell', '--project', 'web', '--cwd', SHOP);
  await cli(fs, 'new', 'solo', '--cwd', ROOT);
  return fs;
}

const fs = await generated();
const json = (path: string): Record<string, Record<string, string>> =>
  JSON.parse(fs.at(path)) as Record<string, Record<string, string>>;

const APPS = ['shop/apps/web', 'shop/apps/admin', 'solo'];
const LIB = 'shop/libs/ui';

describe('the prefix is the project\'s name unless --prefix says otherwise (§3.2)', () => {
  it('derives a prefix a tag can start with', () => {
    expect(prefixOf('shop')).toBe('shop');
    expect(prefixOf('My-Shop')).toBe('myshop');
    expect(prefixOf('3d_shop')).toBe('dshop');
    expect(prefixOf('apps/admin')).toBe('admin');
    expect(prefixOf('C:\\work\\Tienda')).toBe('tienda');
    expect(prefixOf('---')).toBe('app');
    expect(prefixOf('42')).toBe('app');
  });

  it('defaults it in new, new --workspace (the app\'s name), g app and g lib', () => {
    const prefix = (argv: readonly string[]): unknown => {
      const parsed = parseArgs(argv);
      return 'opts' in parsed && 'prefix' in parsed.opts ? parsed.opts.prefix : undefined;
    };
    expect(prefix(['new', 'my-shop'])).toBe('myshop');
    expect(prefix(['new', 'shop', '--workspace', '--app', 'web'])).toBe('web');
    expect(prefix(['new', 'shop', '--workspace'])).toBe('shop');
    expect(prefix(['g', 'app', 'admin'])).toBe('admin');
    expect(prefix(['g', 'lib', 'ui'])).toBe('ui');
    expect(prefix(['g', 'lib', 'ui', '--prefix', 'x'])).toBe('x');
    expect(prefix(['new', 'shop', '--prefix', 'acme'])).toBe('acme');
  });

  it('writes it to every fudic.json', () => {
    expect(json('shop/apps/web/fudic.json')['prefix']).toBe('web');
    expect(json('shop/apps/admin/fudic.json')['prefix']).toBe('admin');
    expect(json('shop/libs/ui/fudic.json')['prefix']).toBe('ui');
    expect(json('solo/fudic.json')['prefix']).toBe('solo');
  });
});

describe('every app and every lib is born able to test itself (§4.2)', () => {
  it('runs its unit tests and its criteria from package.json', () => {
    for (const dir of [...APPS, LIB]) {
      expect(json(`${dir}/package.json`)['scripts'], dir).toMatchObject({
        test: 'vitest run',
        spec: 'fudic-workbench run --pass-with-no-specs',
      });
    }
  });

  it('pins what testing needs, at exact versions', () => {
    const fudic = { '@fudic/cli': FUDIC_VERSION, '@fudic/terms': FUDIC_VERSION, '@fudic/testing': FUDIC_VERSION, '@fudic/vite': FUDIC_VERSION, '@fudic/workbench': FUDIC_VERSION };
    for (const dir of APPS) {
      expect(json(`${dir}/package.json`)['devDependencies'], dir).toEqual({
        ...fudic,
        typescript: TYPESCRIPT_VERSION,
        vite: VITE_VERSION,
        vitest: VITEST_VERSION,
      });
    }
    expect(json(`${LIB}/package.json`)['devDependencies']).toEqual({
      ...fudic,
      '@fudic/core': FUDIC_VERSION,
      '@fudic/ssr': FUDIC_VERSION,
      vite: VITE_VERSION,
      vitest: VITEST_VERSION,
    });
    for (const dir of [...APPS, LIB]) {
      const pkg = json(`${dir}/package.json`);
      for (const version of Object.values({ ...pkg['dependencies'], ...pkg['devDependencies'] })) {
        // Exact, or a library of the same workspace.
        expect(version, dir).toMatch(/^(\d+\.\d+\.\d+|workspace:\*)$/u);
      }
    }
  });

  it('writes vitest.config.ts with fudicTest()', () => {
    for (const dir of [...APPS, LIB]) {
      expect(fs.at(`${dir}/vitest.config.ts`), dir).toBe(`import { defineConfig } from 'vitest/config';
import { fudicTest } from '@fudic/testing/config';

// Unit tests live next to what they test, as src/**/*.test.ts.
export default defineConfig({
  plugins: [fudicTest()],
  test: { include: ['src/**/*.test.ts'], passWithNoTests: true },
});
`);
    }
  });

  it('writes src/fudic-env.d.ts with the .fud declaration and one comment line', () => {
    for (const dir of [...APPS, LIB]) {
      expect(fs.at(`${dir}/src/fudic-env.d.ts`), dir).toBe(`// Lets a .ts file import a .fud component: its tests and its fixtures.
declare module '*.fud' {
  export type $Props = any;
  export const tag: string;
  export const css: string;
  export function render(...args: never[]): unknown;
  export const $file: string;
}
`);
    }
  });
});

describe('pages and layouts come with their unit test (§4.4)', () => {
  it('new and g app write the test of the home page and of the first layout', () => {
    for (const dir of APPS) {
      expect(fs.at(`${dir}/src/routes/index.test.ts`), dir).toBe(`import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /', async () => {
  const page = await visit('/');
  expect(page.status).toBe(200);
});
`);
      expect(fs.at(`${dir}/src/layouts/_layout.test.ts`), dir).toBe(`import { expect, test } from 'vitest';
import { renderLayout } from '@fudic/testing';
import * as Layout from './_layout.fud';

test('renders the page inside it', async () => {
  const page = await renderLayout(Layout, { body: '<p>Hello</p>' });
  expect(page.document.querySelector('main')?.textContent).toContain('Hello');
});
`);
    }
  });

  it('g page writes its test beside it, visiting a URL the page answers', () => {
    expect(fs.at('shop/apps/web/src/routes/about.test.ts')).toBe(pageTest('/about'));
    expect(fs.at('shop/apps/web/src/routes/blog/[slug].test.ts')).toBe(pageTest('/blog/example'));
    expect(pageTest('/about')).toContain("await visit('/about')");
  });

  it('g layout writes its test beside it, its module named after it', () => {
    const test = fs.at('shop/apps/web/src/layouts/docs-shell.test.ts');
    expect(test).toBe(layoutTest('docs-shell.fud'));
    expect(test).toContain("import * as DocsShell from './docs-shell.fud';");
    expect(test).toContain('renderLayout(DocsShell,');
  });

  it('names a layout module that would not start with a letter', () => {
    expect(layoutTest('2col.fud')).toContain("import * as Layout2col from './2col.fud';");
  });

  it('maps a route file to a URL it answers', () => {
    expect(routeToUrl('index.fud')).toBe('/');
    expect(routeToUrl('about.fud')).toBe('/about');
    expect(routeToUrl('blog/index.fud')).toBe('/blog/');
    expect(routeToUrl('blog/[slug].fud')).toBe('/blog/example');
    expect(routeToUrl('[...rest].fud')).toBe('/example');
  });

  it('--skip-test writes the page or the layout alone', async () => {
    const own = await generated();
    await cli(own, 'g', 'page', 'contact', '--skip-test', '--project', 'web', '--cwd', SHOP);
    await cli(own, 'g', 'layout', 'plain', '--skip-test', '--project', 'web', '--cwd', SHOP);
    const paths = own.paths();
    expect(paths).toContain('shop/apps/web/src/routes/contact.fud');
    expect(paths).not.toContain('shop/apps/web/src/routes/contact.test.ts');
    expect(paths).toContain('shop/apps/web/src/layouts/plain.fud');
    expect(paths).not.toContain('shop/apps/web/src/layouts/plain.test.ts');
  });

  it('refuses to write over a test that is already there, and --force overwrites it', async () => {
    const own = await generated();
    own.write(`${SHOP}/apps/web/src/routes/news.test.ts`, 'mine');
    own.write(`${SHOP}/apps/web/src/layouts/wide.test.ts`, 'mine');
    const exit = async (...argv: string[]): Promise<number> =>
      run(argv, { readIo: own, writeIo: own, runner: new RecordingRunner(), streams: captureStreams().streams });

    expect(await exit('g', 'page', 'news', '--project', 'web', '--cwd', SHOP)).toBe(1);
    expect(await exit('g', 'layout', 'wide', '--project', 'web', '--cwd', SHOP)).toBe(1);
    expect(own.at('shop/apps/web/src/routes/news.test.ts')).toBe('mine');

    expect(await exit('g', 'page', 'news', '--force', '--project', 'web', '--cwd', SHOP)).toBe(0);
    expect(await exit('g', 'layout', 'wide', '--force', '--project', 'web', '--cwd', SHOP)).toBe(0);
    expect(own.at('shop/apps/web/src/routes/news.test.ts')).toBe(pageTest('/news'));
    expect(own.at('shop/apps/web/src/layouts/wide.test.ts')).toBe(layoutTest('wide.fud'));
  });
});

describe('the READMEs describe what is generated (§4.9)', () => {
  it('a standalone app runs its scripts with its package manager', async () => {
    expect(fs.at('solo/README.md')).toContain('pnpm run test       # unit tests, src/**/*.test.ts');
    const npm = new MemoryFs({}, ROOT);
    await cli(npm, 'new', 'solo', '--pm', 'npm', '--cwd', ROOT);
    expect(npm.at('solo/README.md')).toContain('npm run spec       # .fudspec criteria, in a browser');
  });

  it('an app of a workspace runs them from the root, filtered', () => {
    const readme = fs.at('shop/apps/admin/README.md');
    expect(readme).toContain('pnpm --filter admin test');
    expect(readme).not.toContain('pnpm run');
    expect(readme).toContain('- `fudic.json`: its id, and the tag prefix of its components (`admin-`).');
    expect(readme).toContain('# <admin-card>, linked from the home page');
  });

  it('a library says its prefix, its commands and how an app uses it', () => {
    const readme = fs.at(`${LIB}/README.md`);
    expect(readme).toContain('pnpm --filter ui test');
    expect(readme).toContain('pnpm --filter ui spec');
    expect(readme).toContain('turns `card` into `<ui-card>`');
    expect(readme).toContain('<link rel="component" href="@shop/ui/ui-card.fud">');
  });
});

/**
 * §6.14 — what a user opens is about their project. Nothing cites a spec, explains the compiler
 * or takes more than a line to say what the user can do with the file.
 */
describe('generated files carry no design comments (§4.8, §6.14)', () => {
  /** The comments of more than one line in `text`, by the comment syntax of its file. */
  function longComments(path: string, text: string): readonly string[] {
    const found: string[] = [];
    const blocks = (open: string, close: string): void => {
      let at = text.indexOf(open);
      while (at !== -1) {
        const end = text.indexOf(close, at + open.length);
        const block = text.slice(at, end === -1 ? undefined : end + close.length);
        if (block.includes('\n')) found.push(block);
        at = end === -1 ? -1 : text.indexOf(open, end + close.length);
      }
    };
    const runs = (line: RegExp): void => {
      const lines = text.split('\n');
      for (let i = 1; i < lines.length; i++) {
        if (line.test(lines[i]!) && line.test(lines[i - 1]!)) found.push(`${lines[i - 1]}\n${lines[i]}`);
      }
    };
    if (/\.(ts|js)$/u.test(path)) {
      blocks('/*', '*/');
      runs(/^\s*\/\/(?!\/)/u);
    } else if (path.endsWith('.fud')) {
      blocks('@*', '*@');
      blocks('<!--', '-->');
      blocks('/*', '*/');
    } else if (path.endsWith('.yaml')) {
      runs(/^\s*#/u);
    } else if (path.endsWith('.md')) {
      blocks('<!--', '-->');
    }
    return found;
  }

  it('finds every kind of long comment it looks for', () => {
    expect(longComments('a.ts', '/* one\n two */')).toHaveLength(1);
    expect(longComments('a.ts', '// one\n// two\n')).toHaveLength(1);
    expect(longComments('a.ts', '/// <reference />\n/// <reference />\n// one line\nx')).toEqual([]);
    expect(longComments('a.ts', '/* open')).toEqual([]);
    expect(longComments('a.fud', '@* a\n b *@ <!-- c\n d -->')).toHaveLength(2);
    expect(longComments('a.yaml', '# a\n# b\n')).toHaveLength(1);
    expect(longComments('a.md', '<!-- a\n b -->')).toHaveLength(1);
    expect(longComments('a.txt', '/* a\n b */')).toEqual([]);
  });

  it('walks every file of §6.2–§6.4, pages, layouts and fudic-globals.d.ts included', () => {
    const paths = fs.paths();
    expect(paths).toContain('shop/fudic-globals.d.ts');
    expect(paths).toContain('solo/fudic-globals.d.ts');
    expect(paths).toContain('shop/apps/web/src/layouts/_layout.fud');
    expect(paths).toContain('shop/apps/web/vite.config.ts');
    expect(paths).toContain('shop/libs/ui/README.md');

    const offenders: string[] = [];
    for (const path of paths) {
      const text = fs.at(path);
      for (const word of ['SDD-', 'BUG-', 'emitter']) if (text.includes(word)) offenders.push(`${path}: "${word}"`);
      for (const comment of longComments(path, text)) offenders.push(`${path}:\n${comment}`);
    }
    expect(offenders).toEqual([]);
  });
});
