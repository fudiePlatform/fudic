/**
 * BUG-50 §4.6, §4.7, §6.10–§6.13 — adding to a project that exists: a module of fudic, a library
 * of the workspace, a service, a form, a stylesheet, a style library. Through the binary, over
 * the workspace of §6.2–§6.5; the texts of §6 exactly.
 */

import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../src/args.js';
import { commandHelp } from '../../src/help/commands.js';
import { FUDIC_VERSION } from '../../src/project.js';
import { run } from '../../src/run.js';
import { captureStreams, MemoryFs, RecordingRunner } from '../helpers.js';

const ROOT = '/w';
const SHOP = `${ROOT}/shop`;

interface Ran {
  readonly code: number;
  readonly out: string;
  readonly err: string;
  readonly commands: readonly string[];
}

async function cli(fs: MemoryFs, ...argv: string[]): Promise<Ran> {
  const capture = captureStreams();
  const runner = new RecordingRunner();
  const code = await run(argv, { readIo: fs, writeIo: fs, runner, streams: capture.streams });
  // The drive letter of Windows, out: the same line on every platform.
  return { code, out: capture.stdout(), err: capture.stderr(), commands: runner.commands.map((line) => line.replace(/ @ [A-Za-z]:/u, ' @ ')) };
}

async function ok(fs: MemoryFs, ...argv: string[]): Promise<Ran> {
  const ran = await cli(fs, ...argv);
  if (ran.code !== 0) throw new Error(`fudic ${argv.join(' ')} exited ${ran.code}:\n${ran.out}${ran.err}`);
  return ran;
}

/** §6.2–§6.5: shop, its app web, the library ui with ui-button, and admin using ui. */
async function shop(): Promise<MemoryFs> {
  const fs = new MemoryFs({}, ROOT);
  await ok(fs, 'new', 'shop', '--workspace', '--app', 'web', '--cwd', ROOT);
  await ok(fs, 'g', 'lib', 'ui', '--cwd', SHOP);
  await ok(fs, 'g', 'component', 'button', '--project', 'ui', '--cwd', SHOP);
  await ok(fs, 'g', 'app', 'admin', '--uses', 'ui', '--cwd', SHOP);
  return fs;
}

const json = (fs: MemoryFs, path: string): Record<string, unknown> => JSON.parse(fs.at(path)) as Record<string, unknown>;
const deps = (fs: MemoryFs, path: string): Record<string, string> => (json(fs, path)['dependencies'] ?? {}) as Record<string, string>;

describe('fudic add <module> (§6.10)', () => {
  it('fudic add forms --project admin — exactly, the dependency and the install', async () => {
    const fs = await shop();
    const { out, commands } = await ok(fs, 'add', 'forms', '--project', 'admin', '--cwd', SHOP);
    expect(out).toBe(`
Added @fudic/forms 0.0.1 to admin
  Installed dependencies (pnpm)
`);
    expect(deps(fs, 'shop/apps/admin/package.json')['@fudic/forms']).toBe(FUDIC_VERSION);
    expect(commands).toEqual(['pnpm install @ /w/shop']);
  });

  it('says a module already there, and changes and installs nothing', async () => {
    const fs = await shop();
    await ok(fs, 'add', 'di', '--project', 'web', '--cwd', SHOP);
    const before = fs.at('shop/apps/web/package.json');
    const { out, commands } = await ok(fs, 'add', 'di', '--project', 'web', '--cwd', SHOP);
    expect(out).toBe('\nweb already has @fudic/di\n');
    expect(commands).toEqual([]);
    expect(fs.at('shop/apps/web/package.json')).toBe(before);
  });

  it('add http writes src/http.ts, the chain every server function goes through', async () => {
    const fs = await shop();
    const { out } = await ok(fs, 'add', 'http', '--project', 'web', '--cwd', SHOP);
    expect(out).toBe(`
Added @fudic/http 0.0.1 to web
  Installed dependencies (pnpm)
  src/http.ts: the chain every server function goes through
`);
    expect(fs.at('shop/apps/web/src/http.ts')).toBe(`import { chain, csrf, errorPages } from '@fudic/http';

// Every server function of the app goes through this chain, load() included.
export default chain().use(csrf, errorPages());
`);
  });

  it('add http keeps an http.ts of the user: adds the module, says nothing of the file', async () => {
    const fs = await shop();
    fs.write(`${SHOP}/apps/web/src/http.ts`, 'mine');
    const { out, commands } = await ok(fs, 'add', 'http', '--project', 'web', '--cwd', SHOP);
    expect(out).toBe('\nAdded @fudic/http 0.0.1 to web\n  Installed dependencies (pnpm)\n');
    expect(commands).toEqual(['pnpm install @ /w/shop']);
    expect(fs.at('shop/apps/web/src/http.ts')).toBe('mine');
  });

  it('add http a second time has it already; --force writes the chain again, and installs nothing', async () => {
    const fs = await shop();
    await ok(fs, 'add', 'http', '--project', 'web', '--cwd', SHOP);
    fs.write(`${SHOP}/apps/web/src/http.ts`, 'edited');

    const again = await ok(fs, 'add', 'http', '--project', 'web', '--cwd', SHOP);
    expect(again.out).toBe('\nweb already has @fudic/http\n');
    expect(again.commands).toEqual([]);
    expect(fs.at('shop/apps/web/src/http.ts')).toBe('edited');

    const forced = await ok(fs, 'add', 'http', '--project', 'web', '--force', '--cwd', SHOP);
    expect(forced.out).toBe('\nUpdated web\n  src/http.ts: the chain every server function goes through\n');
    expect(forced.commands).toEqual([]);
    expect(fs.at('shop/apps/web/src/http.ts')).toContain('chain().use(csrf, errorPages());');
  });

  it('add i18n --locales writes the app\'s languages to fudic.json; again, only updates them', async () => {
    const fs = await shop();
    const first = await ok(fs, 'add', 'i18n', '--locales', 'es,en', '--project', 'web', '--cwd', SHOP);
    expect(first.out).toBe(`
Added @fudic/i18n 0.0.1 to web
  Installed dependencies (pnpm)
  locales es, en in fudic.json: fudic translate writes their catalogs
`);
    expect(json(fs, 'shop/apps/web/fudic.json')).toEqual({ id: 'web', kind: 'app', prefix: 'web', locales: ['es', 'en'] });

    const second = await ok(fs, 'add', 'i18n', '--locales', 'fr', '--project', 'web', '--cwd', SHOP);
    expect(second.out).toBe('\nUpdated web\n  locales fr in fudic.json: fudic translate writes their catalogs\n');
    expect(second.commands).toEqual([]);
    expect(json(fs, 'shop/apps/web/fudic.json')['locales']).toEqual(['fr']);
  });

  it('installs in the app itself outside a workspace', async () => {
    const fs = new MemoryFs({}, ROOT);
    await ok(fs, 'new', 'solo', '--cwd', ROOT);
    const { commands } = await ok(fs, 'add', 'forms', '--cwd', `${ROOT}/solo/src`);
    expect(commands).toEqual(['pnpm install @ /w/solo']);
  });
});

describe('fudic add <library> (§6.10)', () => {
  it('fudic add ui --project web — exactly, workspace:* and the link of its first component', async () => {
    const fs = await shop();
    const { out, commands } = await ok(fs, 'add', 'ui', '--project', 'web', '--cwd', SHOP);
    expect(out).toBe(`
web now uses ui
  Installed dependencies (pnpm)
  <link rel="component" href="@shop/ui/ui-button.fud">
`);
    expect(deps(fs, 'shop/apps/web/package.json')['@shop/ui']).toBe('workspace:*');
    expect(commands).toEqual(['pnpm install @ /w/shop']);
  });

  it('says a library already used, and touches nothing', async () => {
    const fs = await shop();
    const { out, commands } = await ok(fs, 'add', 'ui', '--project', 'admin', '--cwd', SHOP);
    expect(out).toBe('\nadmin already uses ui\n');
    expect(commands).toEqual([]);
  });

  it('has no link to show for a library with no components yet', async () => {
    const fs = await shop();
    await ok(fs, 'g', 'lib', 'kit', '--cwd', SHOP);
    const { out } = await ok(fs, 'add', 'kit', '--project', 'web', '--cwd', SHOP);
    expect(out).toBe('\nweb now uses kit\n  Installed dependencies (pnpm)\n');
  });

  it('names a library by its folder when its package.json has no name', async () => {
    const fs = await shop();
    fs.write(`${SHOP}/libs/raw/fudic.json`, '{"kind":"lib","prefix":"raw"}');
    await ok(fs, 'add', 'raw', '--project', 'web', '--cwd', SHOP);
    expect(deps(fs, 'shop/apps/web/package.json')['raw']).toBe('workspace:*');

    fs.write(`${SHOP}/libs/blank/fudic.json`, '{"kind":"lib","prefix":"blank"}');
    fs.write(`${SHOP}/libs/blank/package.json`, '{"name":""}');
    await ok(fs, 'add', 'blank', '--project', 'web', '--cwd', SHOP);
    expect(deps(fs, 'shop/apps/web/package.json')['blank']).toBe('workspace:*');
  });

  it('FUD0455 for what is neither a module nor a library, listing the libraries it could be', async () => {
    const fs = await shop();
    const unknown = await cli(fs, 'add', 'uii', '--project', 'web', '--cwd', SHOP);
    expect(unknown.code).toBe(1);
    expect(unknown.out).toContain('FUD0455');
    expect(unknown.out).toContain('ui');
    // A library is not something it can add to itself.
    const itself = await cli(fs, 'add', 'ui', '--project', 'ui', '--cwd', SHOP);
    expect(itself.code).toBe(1);
    expect(itself.out).toContain('FUD0455');

    const solo = new MemoryFs({}, ROOT);
    await ok(solo, 'new', 'solo', '--cwd', ROOT);
    expect((await cli(solo, 'add', 'ui', '--cwd', `${ROOT}/solo`)).out).toContain('FUD0455');
  });

  it('the project errors, outside every project', async () => {
    const { code, out } = await cli(new MemoryFs({}, ROOT), 'add', 'forms', '--cwd', '/elsewhere');
    expect(code).toBe(1);
    expect(out).toContain('FUD0781');
  });
});

describe('parsing fudic add', () => {
  it('needs a module, and takes --locales only with i18n', () => {
    expect(parseArgs(['add'])).toMatchObject({
      kind: 'error',
      hints: ['it adds di, forms, http, i18n or a library of the workspace: fudic add forms'],
      topic: 'add',
    });
    expect(parseArgs(['add', 'forms', '--locales', 'es'])).toMatchObject({
      kind: 'error',
      error: { message: 'unknown flag --locales' },
      hints: ['the locales are those of fudic add i18n --locales es,en'],
    });
    expect(parseArgs(['add', 'i18n', '--locales', 'es,en'])).toMatchObject({ kind: 'add', module: 'i18n', opts: { locales: ['es', 'en'] } });
    expect(parseArgs(['add', 'ui', '--zz'])).toMatchObject({ kind: 'error', hints: ['it takes: --project, --locales, --dry-run, --force'] });
  });
});

describe('fudic g service (§6.11)', () => {
  it('fudic g service cart --project web — exactly, and the module it needs', async () => {
    const fs = await shop();
    const { out, commands } = await ok(fs, 'g', 'service', 'cart', '--project', 'web', '--cwd', SHOP);
    expect(out).toBe(`
Created service Cart in apps/web/src/services/
  cart.service.ts         class Cart, registered in the root: inject(Cart) anywhere
  cart.service.test.ts    unit test

  Added @fudic/di 0.0.1 to web (it was not there)
`);
    expect(commands).toEqual(['pnpm install @ /w/shop']);
    expect(deps(fs, 'shop/apps/web/package.json')['@fudic/di']).toBe(FUDIC_VERSION);
    expect(fs.at('shop/apps/web/src/services/cart.service.ts')).toBe(`import { Service } from '@fudic/di';

// One for the whole app: inject(Cart) gives every component the same instance.
export class Cart {}
Service(Cart);
`);
    expect(fs.at('shop/apps/web/src/services/cart.service.test.ts')).toBe(`import { expect, test } from 'vitest';
import { Cart } from './cart.service';

test('creates a Cart', () => {
  expect(new Cart()).toBeInstanceOf(Cart);
});
`);
  });

  it('--provided: a class a component provides, no Service(); the second one adds no module', async () => {
    const fs = await shop();
    await ok(fs, 'g', 'service', 'cart', '--project', 'web', '--cwd', SHOP);
    const { out, commands } = await ok(fs, 'g', 'service', 'shopping-cart', '--provided', '--skip-test', '--project', 'web', '--cwd', SHOP);
    expect(out).toBe(`
Created service ShoppingCart in apps/web/src/services/
  shopping-cart.service.ts    class ShoppingCart, provided by a component: provide(ShoppingCart) for its subtree
`);
    expect(commands).toEqual([]);
    expect(fs.at('shop/apps/web/src/services/shopping-cart.service.ts')).toBe(
      '// A component provides it with provide(): that component and the ones under it share one.\nexport class ShoppingCart {}\n',
    );
    expect(fs.paths()).not.toContain('shop/apps/web/src/services/shopping-cart.service.test.ts');
  });

  it('FUD0457 for a name that is not kebab-case, writing nothing', async () => {
    const fs = await shop();
    const before = fs.paths();
    for (const name of ['Cart', 'shopping_cart', '2cart', 'cart-']) {
      const { code, out } = await cli(fs, 'g', 'service', name, '--project', 'web', '--cwd', SHOP);
      expect(code, name).toBe(1);
      expect(out).toContain('FUD0457');
    }
    expect(fs.paths()).toEqual(before);
  });

  it('refuses a service that is already there, and the project errors', async () => {
    const fs = await shop();
    await ok(fs, 'g', 'service', 'cart', '--project', 'web', '--cwd', SHOP);
    expect((await cli(fs, 'g', 'service', 'cart', '--project', 'web', '--cwd', SHOP)).out).toContain('FUD0443');
    expect((await cli(fs, 'g', 'service', 'cart', '--project', 'nope', '--cwd', SHOP)).out).toContain('FUD0782');
  });
});

describe('fudic g form (§6.12)', () => {
  it('fudic g form person --project web --binary — exactly, and its file', async () => {
    const fs = await shop();
    const { out } = await ok(fs, 'g', 'form', 'person', '--project', 'web', '--binary', '--cwd', SHOP);
    expect(out).toBe(`
Created form personForm in apps/web/src/forms/
  person.form.ts         typed controls (str, u8, bool…): the upload travels in binary
  person.form.test.ts    unit test

  Added @fudic/forms 0.0.1 to web (it was not there)
`);
    expect(fs.at('shop/apps/web/src/forms/person.form.ts')).toBe(`import { form, required, str } from '@fudic/forms';

export const personForm = form({
  name: str('', [required], { messages: { required: () => 'Name is required.' } }),
});
`);
    expect(fs.at('shop/apps/web/src/forms/person.form.test.ts')).toBe(`import { expect, test } from 'vitest';
import { personForm } from './person.form';

test('asks for the name', () => {
  expect(personForm.$valid()).toBe(false);
  personForm.name.set('Ada');
  expect(personForm.$valid()).toBe(true);
});
`);
  });

  it('without --binary, control(); a hyphenated name, a camel-case form; admin already has forms', async () => {
    const fs = await shop();
    await ok(fs, 'add', 'forms', '--project', 'admin', '--cwd', SHOP);
    const { out, commands } = await ok(fs, 'g', 'form', 'contact-us', '--project', 'admin', '--cwd', SHOP);
    expect(out).toBe(`
Created form contactUsForm in apps/admin/src/forms/
  contact-us.form.ts         its controls and their validators
  contact-us.form.test.ts    unit test
`);
    expect(commands).toEqual([]);
    expect(fs.at('shop/apps/admin/src/forms/contact-us.form.ts')).toContain(
      "export const contactUsForm = form({\n  name: control('', [required],",
    );
  });

  it('FUD0457 for a name that is not kebab-case', async () => {
    const fs = await shop();
    expect((await cli(fs, 'g', 'form', 'Person', '--project', 'web', '--cwd', SHOP)).out).toContain('FUD0457');
  });
});

describe('fudic g lib --styles-only and g style (§6.13)', () => {
  it('fudic g lib guia --styles-only — exactly, no install, no tests', async () => {
    const fs = await shop();
    const { out, commands } = await ok(fs, 'g', 'lib', 'guia', '--styles-only', '--cwd', SHOP);
    expect(out).toBe(`
Created style library guia in libs/guia

  tokens.css     global stylesheet, adopted by every component of whoever uses guia
  no components, no tests, no spec

Use it
  fudic add guia --project ui      a library: its components read the tokens
  fudic add guia --project web     an app
`);
    expect(commands).toEqual([]);
    expect(fs.paths().filter((path) => path.startsWith('shop/libs/guia/'))).toEqual([
      'shop/libs/guia/.gitignore',
      'shop/libs/guia/README.md',
      'shop/libs/guia/fudic.json',
      'shop/libs/guia/package.json',
      'shop/libs/guia/tokens.css',
    ]);
    expect(json(fs, 'shop/libs/guia/fudic.json')).toEqual({ kind: 'lib', globalStyles: { tokens: 'tokens.css' } });
    expect(json(fs, 'shop/libs/guia/package.json')).toMatchObject({
      name: '@shop/guia',
      files: ['tokens.css', 'fudic.json'],
      exports: { './fudic.json': './fudic.json', './tokens.css': './tokens.css' },
    });
    expect(fs.at('shop/libs/guia/tokens.css')).toContain('--guia-ink:');
  });

  it('names ui and web in its hints when the workspace has neither yet', async () => {
    const fs = new MemoryFs({}, ROOT);
    await ok(fs, 'new', 'shop', '--workspace', '--app', 'store', '--cwd', ROOT);
    const { out } = await ok(fs, 'g', 'lib', 'guia', '--styles-only', '--cwd', SHOP);
    expect(out).toContain('  fudic add guia --project ui        a library: its components read the tokens\n');
    expect(out).toContain('  fudic add guia --project store     an app\n');
  });

  it('fudic g style ui --project ui — exactly; the library publishes the sheet', async () => {
    const fs = await shop();
    const { out, commands } = await ok(fs, 'g', 'style', 'ui', '--project', 'ui', '--cwd', SHOP);
    expect(out).toBe(`
Created ui.css in libs/ui
  adopted by every component of ui, after the sheets of the libraries it uses
`);
    expect(commands).toEqual([]);
    expect(fs.at('shop/libs/ui/ui.css')).toBe('/* Adopted inside every component of ui: write :host, not body. */\n:host {\n}\n');
    expect(json(fs, 'shop/libs/ui/fudic.json')['globalStyles']).toEqual({ ui: 'ui.css' });
    const pkg = json(fs, 'shop/libs/ui/package.json');
    expect(pkg['files']).toContain('ui.css');
    expect(pkg['exports']).toMatchObject({ './ui.css': './ui.css' });

    // A second sheet keeps the first, and lists itself once.
    await ok(fs, 'g', 'style', 'print', '--project', 'ui', '--cwd', SHOP);
    expect(json(fs, 'shop/libs/ui/fudic.json')['globalStyles']).toEqual({ ui: 'ui.css', print: 'print.css' });
    expect((json(fs, 'shop/libs/ui/package.json')['files'] as string[]).filter((file) => file === 'ui.css')).toHaveLength(1);
  });

  it('in an app: the sheet and fudic.json, its package.json untouched', async () => {
    const fs = await shop();
    const before = fs.at('shop/apps/web/package.json');
    await ok(fs, 'g', 'style', 'theme', '--project', 'web', '--cwd', SHOP);
    expect(json(fs, 'shop/apps/web/fudic.json')['globalStyles']).toEqual({ theme: 'theme.css' });
    expect(fs.at('shop/apps/web/package.json')).toBe(before);
  });

  it('lists the sheet in a library whose package.json has no files nor exports yet', async () => {
    const fs = await shop();
    fs.write(`${SHOP}/libs/bare/fudic.json`, '{"kind":"lib"}');
    fs.write(`${SHOP}/libs/bare/package.json`, '{"name":"@shop/bare"}');
    await ok(fs, 'g', 'style', 'bare', '--project', 'bare', '--cwd', SHOP);
    expect(json(fs, 'shop/libs/bare/package.json')).toEqual({ name: '@shop/bare', files: ['bare.css'], exports: { './bare.css': './bare.css' } });
  });

  it('FUD0456 for a name a style cannot have, and for one the project already has', async () => {
    const fs = await shop();
    const bad = await cli(fs, 'g', 'style', 'Bad Name', '--project', 'web', '--cwd', SHOP);
    expect(bad.code).toBe(1);
    expect(bad.out).toContain('FUD0456');
    await ok(fs, 'g', 'style', 'theme', '--project', 'web', '--cwd', SHOP);
    const taken = await cli(fs, 'g', 'style', 'theme', '--project', 'web', '--cwd', SHOP);
    expect(taken.code).toBe(1);
    expect(taken.out).toContain('FUD0456');
    expect(taken.out).toContain('theme.css');
  });

  it('refuses a sheet that is there without being declared, and the project errors', async () => {
    const fs = await shop();
    fs.write(`${SHOP}/apps/web/theme.css`, 'mine');
    expect((await cli(fs, 'g', 'style', 'theme', '--project', 'web', '--cwd', SHOP)).out).toContain('FUD0443');
    expect((await cli(fs, 'g', 'style', 'theme', '--project', 'nope', '--cwd', SHOP)).out).toContain('FUD0782');
  });
});

describe('parsing service, form and style', () => {
  it('reads their flags, says what each takes, and has a help for each', () => {
    expect(parseArgs(['g', 'service', 'cart', '--provided'])).toMatchObject({ kind: 'service', opts: { provided: true, test: true } });
    expect(parseArgs(['g', 'form', 'person', '--binary', '--skip-test'])).toMatchObject({ kind: 'form', opts: { binary: true, test: false } });
    expect(parseArgs(['g', 'style', 'theme', '--project', 'web'])).toMatchObject({ kind: 'style', name: 'theme', opts: { project: 'web' } });
    expect(parseArgs(['g', 'lib', 'guia', '--styles-only'])).toMatchObject({ kind: 'lib', opts: { stylesOnly: true } });
    expect(parseArgs(['g', 'lib', 'ui'])).not.toMatchObject({ opts: { stylesOnly: true } });
    const hint = (argv: readonly string[]): unknown => {
      const parsed = parseArgs(argv);
      return parsed.kind === 'error' ? parsed.hints[0] : parsed.kind;
    };
    expect(hint(['g', 'service', 'x', '--zz'])).toBe('it takes: --project, --provided, --skip-test, --dry-run, --force');
    expect(hint(['g', 'form', 'x', '--zz'])).toBe('it takes: --project, --binary, --skip-test, --dry-run, --force');
    expect(hint(['g', 'style', 'x', '--zz'])).toBe('it takes: --project, --dry-run, --force');
    expect(hint(['g', 'service'])).toBe('e.g. fudic g service cart');
    expect(hint(['g', 'form'])).toBe('e.g. fudic g form person');
    expect(hint(['g', 'style'])).toBe('e.g. fudic g style theme');
    for (const topic of ['add', 'generate service', 'generate form', 'generate style'] as const) {
      expect(commandHelp(topic).startsWith(`fudic ${topic}`), topic).toBe(true);
    }
    expect(parseArgs(['add', '--help'])).toEqual({ kind: 'help', topic: 'add' });
  });
});

describe('the corners of what they say and write', () => {
  it('g lib --styles-only in a workspace with no app names "web"', async () => {
    const fs = new MemoryFs(
      { 'shop/pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - 'libs/*'\n", 'shop/package.json': '{"name":"shop","private":true}' },
      ROOT,
    );
    const { out } = await ok(fs, 'g', 'lib', 'guia', '--styles-only', '--cwd', SHOP);
    expect(out).toContain('  fudic add guia --project web     an app\n');
  });

  it('g form --skip-test writes the form alone', async () => {
    const fs = await shop();
    const { out } = await ok(fs, 'g', 'form', 'person', '--skip-test', '--project', 'web', '--cwd', SHOP);
    expect(out).not.toContain('unit test');
    expect(fs.paths()).not.toContain('shop/apps/web/src/forms/person.form.test.ts');
  });

  it('g style in a library that already lists the sheet in files lists it once', async () => {
    const fs = await shop();
    fs.write(`${SHOP}/libs/ui/package.json`, JSON.stringify({ name: '@shop/ui', files: ['src', 'ui.css'], exports: {} }));
    await ok(fs, 'g', 'style', 'ui', '--project', 'ui', '--cwd', SHOP);
    expect(json(fs, 'shop/libs/ui/package.json')['files']).toEqual(['src', 'ui.css']);
  });
});
