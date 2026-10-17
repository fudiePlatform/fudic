/**
 * BUG-50 §4.5, §4.6, §6.2–§6.4 — a workspace that runs everything from its root, and commands
 * that say what they made and what to run next. Read from what the binary prints and writes.
 */

import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../src/args.js';
import { commandHelp } from '../../src/help/commands.js';
import { planCheck } from '../../src/plans/check.js';
import { setupReport } from '../../src/plans/new.js';
import { FUDIC_VERSION, TYPESCRIPT_VERSION } from '../../src/project.js';
import { run } from '../../src/run.js';
import { viteSettings } from '../../src/templates.js';
import { captureStreams, MemoryFs, RecordingRunner } from '../helpers.js';
import type { NewOptions } from '../../src/types.js';

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

async function shop(): Promise<MemoryFs> {
  const fs = new MemoryFs({}, ROOT);
  expect((await cli(fs, 'new', 'shop', '--workspace', '--app', 'web', '--cwd', ROOT)).code).toBe(0);
  return fs;
}

describe('fudic new shop --workspace --app web (§6.2)', () => {
  it('says what it created, what it ran and what is next — exactly', async () => {
    const fs = new MemoryFs({}, ROOT);
    const { code, out, commands } = await cli(fs, 'new', 'shop', '--workspace', '--app', 'web', '--cwd', ROOT);
    expect(code).toBe(0);
    expect(out).toBe(`
Created workspace shop

  shop/
    README.md          what apps/ and libs/ are, and the commands below
    apps/web/          app web, served at /
    libs/              empty — fudic g lib <name>

  Installed dependencies (pnpm)
  Committed: "chore: create workspace shop"

Next
  cd shop
  pnpm dev           http://localhost:5173/
  pnpm test          unit tests of every project
  pnpm spec          .fudspec criteria of every project
`);
    expect(commands).toEqual([
      'pnpm install @ /w/shop',
      'git init -b main @ /w/shop',
      'git add -A @ /w/shop',
      'git commit -m chore: create workspace shop @ /w/shop',
    ]);
  });

  it('gives the root the scripts that run every app and every project', async () => {
    const fs = await shop();
    const pkg = JSON.parse(fs.at('shop/package.json')) as Record<string, Record<string, string>>;
    expect(pkg['scripts']).toEqual({
      dev: 'fudic dev',
      preview: 'fudic preview',
      build: 'pnpm -r build',
      test: 'fudic test',
      spec: 'fudic spec',
    });
    expect(pkg['devDependencies']).toEqual({ '@fudic/cli': FUDIC_VERSION, typescript: TYPESCRIPT_VERSION });
  });

  it('writes a README of apps/, libs/ and those commands, and an empty libs/', async () => {
    const fs = await shop();
    const readme = fs.at('shop/README.md');
    expect(readme).toContain('- `apps/`: what you serve.');
    expect(readme).toContain('- `libs/`: components your apps use.');
    for (const script of ['dev', 'preview', 'build', 'test', 'spec']) expect(readme).toContain(`pnpm ${script} `);
    expect(readme).toContain('fudic add ui --project web');
    expect(fs.at('shop/libs/.gitkeep')).toBe('');
  });

  it('serves its first app at / on Vite\'s port: its vite.config.ts says nothing of either', async () => {
    const fs = await shop();
    const config = fs.at('shop/apps/web/vite.config.ts');
    expect(config).not.toContain('base:');
    expect(config).not.toContain('server:');
  });

  it('says only what ran: --no-install and --no-git leave their lines out', async () => {
    const fs = new MemoryFs({}, ROOT);
    const { out, commands } = await cli(fs, 'new', 'shop', '--workspace', '--no-install', '--no-git', '--cwd', ROOT);
    expect(out).not.toContain('Installed');
    expect(out).not.toContain('Committed');
    expect(out).toContain('    apps/shop/         app shop, served at /\n');
    expect(commands).toEqual([]);
  });
});

describe('fudic new <app>: the standalone report', () => {
  it('says what it created and what is next, with its package manager — exactly', async () => {
    const fs = new MemoryFs({}, ROOT);
    const { out, commands } = await cli(fs, 'new', 'solo', '--cwd', ROOT);
    expect(out).toBe(`
Created app solo

  Installed dependencies (pnpm)
  Committed: "chore: create app solo"

Next
  cd solo
  pnpm dev           http://localhost:5173/
  pnpm test          unit tests
  pnpm spec          .fudspec criteria, in a browser
`);
    expect(commands.at(-1)).toBe('git commit -m chore: create app solo @ /w/solo');
  });

  it('keeps the columns with another package manager, and leaves out what did not run', async () => {
    const fs = new MemoryFs({}, ROOT);
    const { out } = await cli(fs, 'new', 'solo', '--pm', 'yarn', '--no-git', '--cwd', ROOT);
    expect(out).toContain('  Installed dependencies (yarn)\n');
    expect(out).not.toContain('Committed');
    expect(out).toContain('  yarn dev           http://localhost:5173/\n');
    expect(out).toContain('  yarn test          unit tests\n');
  });

  it('has nothing to say of the setup when nothing ran', () => {
    const opts = { install: false, git: false, pm: 'pnpm' } as NewOptions;
    expect(setupReport(opts, 'x')).toEqual([]);
  });

  it('runs the install and the commit quietly', async () => {
    const fs = new MemoryFs({}, ROOT);
    const parsed = parseArgs(['new', 'solo', '--cwd', ROOT]);
    if (parsed.kind !== 'new') throw new Error(parsed.kind);
    const { planNew } = await import('../../src/plans/new.js');
    const plan = await planNew('solo', parsed.opts, fs);
    expect(plan.commands.every((command) => command.quiet === true)).toBe(true);
  });
});

describe('fudic g lib ui (§6.3)', () => {
  it('says its prefix, its commands, that it installed, and how an app uses it — exactly', async () => {
    const fs = await shop();
    const { code, out, commands } = await cli(fs, 'g', 'lib', 'ui', '--cwd', SHOP);
    expect(code).toBe(0);
    expect(out).toBe(`
Created library ui in libs/ui

  tag prefix   ui-      fudic g component button --project ui  →  <ui-button>
  test         pnpm --filter ui test
  spec         pnpm --filter ui spec

  Installed dependencies (pnpm)

Use it from an app
  fudic add ui --project web          an app you already have
  fudic g app admin --uses ui         a new app
`);
    // The install is the workspace's: from its root, whichever folder the command runs in.
    expect(commands).toEqual(['pnpm install @ /w/shop']);
  });

  it('installs from the root when run inside a project, and names "web" when there is no app', async () => {
    const fs = new MemoryFs(
      { 'shop/pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - 'libs/*'\n", 'shop/package.json': '{"name":"shop","private":true}' },
      ROOT,
    );
    const { out, commands } = await cli(fs, 'g', 'lib', 'kit', '--cwd', SHOP);
    expect(out).toContain('  fudic add kit --project web          an app you already have\n');
    expect(commands).toEqual(['pnpm install @ /w/shop']);
  });
});

describe('fudic g app admin --uses ui (§6.4)', () => {
  async function withLib(): Promise<MemoryFs> {
    const fs = await shop();
    expect((await cli(fs, 'g', 'lib', 'ui', '--cwd', SHOP)).code).toBe(0);
    return fs;
  }

  it('says its base, what it uses, that it installed, and how to run it — exactly', async () => {
    const fs = await withLib();
    const { code, out, commands } = await cli(fs, 'g', 'app', 'admin', '--uses', 'ui', '--cwd', SHOP);
    expect(code).toBe(0);
    expect(out).toBe(`
Created app admin in apps/admin

  base URL   /admin/     web is at /. Change it with --base
  uses       ui

  Installed dependencies (pnpm)

Next
  pnpm dev                    every app:  http://localhost:5173/  ·  /admin/
  pnpm --filter admin dev     only admin: http://localhost:5174/admin/
`);
    expect(commands).toEqual(['pnpm install @ /w/shop']);
  });

  it('writes its base and its own port into its vite.config.ts', async () => {
    const fs = await withLib();
    await cli(fs, 'g', 'app', 'admin', '--uses', 'ui', '--cwd', SHOP);
    expect(fs.at('shop/apps/admin/vite.config.ts')).toContain(`export default defineConfig({
  base: '/admin/',
  server: { port: 5174 },
  plugins: [fudic()],
});`);
  });

  it('takes the next port after every app, and --base as the user writes it', async () => {
    const fs = await withLib();
    await cli(fs, 'g', 'app', 'admin', '--cwd', SHOP);
    const { out } = await cli(fs, 'g', 'app', 'shopfront', '--base', 'store', '--cwd', SHOP);
    expect(out).toContain('  base URL   /store/     web is at /, admin is at /admin/. Change it with --base\n');
    expect(out).toContain('every app:  http://localhost:5173/  ·  /admin/  ·  /store/\n');
    expect(out).toContain('only shopfront: http://localhost:5175/store/\n');
    expect(out).not.toContain('uses');
  });

  it('puts the first app of a workspace that has none at /', async () => {
    const fs = new MemoryFs(
      { 'shop/pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - 'libs/*'\n", 'shop/package.json': '{"name":"shop","private":true}' },
      ROOT,
    );
    const { out } = await cli(fs, 'g', 'app', 'web', '--cwd', SHOP);
    expect(out).toContain('  base URL   /           Change it with --base\n');
    expect(out).toContain('every app:  http://localhost:5173/\n');
    expect(out).toContain('only web: http://localhost:5173/\n');
    expect(fs.at('shop/apps/web/vite.config.ts')).toContain('  server: { port: 5173 },\n');
    expect(fs.at('shop/apps/web/vite.config.ts')).not.toContain('base:');
  });

  it('refuses a base another app has: FUD0452, writing nothing and installing nothing', async () => {
    const fs = await withLib();
    const before = fs.paths();
    const { code, out, commands } = await cli(fs, 'g', 'app', 'admin', '--base', '/', '--cwd', SHOP);
    expect(code).toBe(1);
    expect(out).toContain('FUD0452');
    expect(fs.paths()).toEqual(before);
    expect(commands).toEqual([]);
  });

  it('writes the settings Vite needs, base only when it is not /', () => {
    expect(viteSettings('/', 5173)).toBe('  server: { port: 5173 },\n');
    expect(viteSettings('/admin/', 5174)).toBe("  base: '/admin/',\n  server: { port: 5174 },\n");
  });
});

describe('fudic test · fudic spec', () => {
  it('at the workspace root, runs every project\'s own, one at a time, without stopping', async () => {
    const fs = await shop();
    for (const kind of ['test', 'spec'] as const) {
      const { code, out, commands } = await cli(fs, kind, '--cwd', SHOP);
      expect(code).toBe(0);
      expect(commands).toEqual([`pnpm -r --no-bail --workspace-concurrency=1 run ${kind} @ /w/shop`]);
      // What the projects print is the report: the CLI adds nothing of its own.
      expect(out).toBe('');
    }
  });

  it('in a project, or for the one --project names, runs that one\'s', async () => {
    const fs = await shop();
    expect((await cli(fs, 'test', '--cwd', `${SHOP}/apps/web/src`)).commands).toEqual(['pnpm run test @ /w/shop/apps/web']);
    expect((await cli(fs, 'spec', '--project', 'web', '--cwd', SHOP)).commands).toEqual(['pnpm run spec @ /w/shop/apps/web']);
  });

  it('in a standalone app, runs its own from where it is', async () => {
    const fs = new MemoryFs({}, ROOT);
    await cli(fs, 'new', 'solo', '--cwd', ROOT);
    const plan = await planCheck('test', { cwd: `${ROOT}/solo`, force: false }, fs);
    expect(plan.commands).toEqual([{ command: 'pnpm', args: ['run', 'test'], dir: '.' }]);
  });

  it('says there is no project outside every project, and runs nothing', async () => {
    const fs = new MemoryFs({ 'x/readme.md': '#' }, ROOT);
    const { code, out, commands } = await cli(fs, 'test', '--cwd', `${ROOT}/x`);
    expect(code).toBe(1);
    expect(out).toContain('FUD0781');
    expect(commands).toEqual([]);
  });

  it('exits 1 when the project\'s run fails', async () => {
    const fs = await shop();
    const capture = captureStreams();
    const code = await run(['test', '--cwd', SHOP], { readIo: fs, writeIo: fs, runner: new RecordingRunner({ pnpm: 1 }), streams: capture.streams });
    expect(code).toBe(1);
  });
});

describe('parsing dev, preview, test and spec', () => {
  it('reads dev and preview with their default port, --port and --project', () => {
    expect(parseArgs(['dev'])).toMatchObject({ kind: 'serve', serve: 'dev', opts: { port: 5173 } });
    expect(parseArgs(['preview'])).toMatchObject({ kind: 'serve', serve: 'preview', opts: { port: 4173 } });
    expect(parseArgs(['dev', '--port', '3000', '--project', 'web'])).toMatchObject({ opts: { port: 3000, project: 'web' } });
    expect(parseArgs(['test', '--project', 'ui'])).toMatchObject({ kind: 'check', check: 'test', opts: { project: 'ui' } });
  });

  it('says how to go on for a bad --port, an argument or a flag they do not take', () => {
    const usage = (argv: readonly string[]): unknown => {
      const parsed = parseArgs(argv);
      return parsed.kind === 'error' ? { message: parsed.error.message, hints: parsed.hints, topic: parsed.topic } : parsed.kind;
    };
    expect(usage(['dev', '--port', 'x'])).toEqual({ message: expect.stringContaining('--port needs a number'), hints: ['e.g. --port 5173'], topic: 'dev' });
    expect(usage(['preview', '--port', 'x'])).toMatchObject({ hints: ['e.g. --port 4173'], topic: 'preview' });
    expect(usage(['dev', 'web'])).toEqual({
      message: expect.stringContaining('"web"'),
      hints: ['it serves the apps of the workspace, or the one --project names'],
      topic: 'dev',
    });
    expect(usage(['spec', 'ui'])).toEqual({
      message: expect.stringContaining('"ui"'),
      hints: ['it runs the project you are in, every project from the workspace root, or the one --project names'],
      topic: 'spec',
    });
    expect(usage(['dev', '--zz'])).toMatchObject({ hints: ['it takes: --project, --port, --dry-run, --force'], topic: 'dev' });
    expect(usage(['test', '--zz'])).toMatchObject({ hints: ['it takes: --project, --dry-run, --force'], topic: 'test' });
  });

  it('has a help for each of them', () => {
    for (const topic of ['dev', 'preview', 'test', 'spec'] as const) {
      expect(parseArgs([topic, '--help'])).toEqual({ kind: 'help', topic });
      expect(commandHelp(topic).startsWith(`fudic ${topic}`)).toBe(true);
    }
  });
});

describe('fudic new shop --workspace --uses ui', () => {
  it('creates the library too, used by the first app, and says so in place of the empty libs/', async () => {
    const fs = new MemoryFs({}, ROOT);
    const { code, out } = await cli(fs, 'new', 'shop', '--workspace', '--app', 'web', '--uses', 'ui', '--uses', 'kit', '--cwd', ROOT);
    expect(code).toBe(0);
    expect(out).toContain(`  shop/
    README.md          what apps/ and libs/ are, and the commands below
    apps/web/          app web, served at /
    libs/ui/           library ui, used by web
    libs/kit/          library kit, used by web
`);
    expect(out).not.toContain('empty — fudic g lib');
    expect(fs.paths()).not.toContain('shop/libs/.gitkeep');
    const web = JSON.parse(fs.at('shop/apps/web/package.json')) as Record<string, Record<string, string>>;
    expect(web['dependencies']).toMatchObject({ '@shop/ui': 'workspace:*', '@shop/kit': 'workspace:*' });
  });

  it('writes the same library g lib writes', async () => {
    const together = new MemoryFs({}, ROOT);
    await cli(together, 'new', 'shop', '--workspace', '--app', 'web', '--uses', 'ui', '--cwd', ROOT);
    const apart = await shop();
    await cli(apart, 'g', 'lib', 'ui', '--cwd', SHOP);
    const lib = (fs: MemoryFs): Record<string, string> =>
      Object.fromEntries(fs.paths().filter((path) => path.startsWith('shop/libs/ui/')).map((path) => [path, fs.at(path)]));
    expect(lib(together)).toEqual(lib(apart));
  });

  it('is a usage error without --workspace: a library lives in a workspace', () => {
    const parsed = parseArgs(['new', 'solo', '--uses', 'ui']);
    expect(parsed).toMatchObject({
      kind: 'error',
      error: { message: 'unknown flag --uses' },
      hints: ['a library lives in a workspace: fudic new <name> --workspace --uses <lib>'],
      topic: 'new',
    });
  });

  it('says it in the help of new', () => {
    expect(commandHelp('new')).toContain('--uses <lib>');
  });
});

describe('g app, among apps whose bases are as long', () => {
  it('lists them by name', async () => {
    const fs = await shop();
    await cli(fs, 'g', 'app', 'admin', '--cwd', SHOP);
    await cli(fs, 'g', 'app', 'store', '--cwd', SHOP);
    const { out } = await cli(fs, 'g', 'app', 'blog', '--cwd', SHOP);
    expect(out).toContain('web is at /, admin is at /admin/, store is at /store/. Change it with --base');
  });
});

describe('the first library takes the place of libs/.gitkeep', () => {
  for (const flags of [[], ['--styles-only']] as const) {
    const kind = flags.length === 0 ? 'g lib' : 'g lib --styles-only';

    it(`${kind} removes it when it is there, and only then`, async () => {
      const fs = await shop();
      expect(fs.paths()).toContain('shop/libs/.gitkeep');
      expect((await cli(fs, 'g', 'lib', 'ui', ...flags, '--cwd', SHOP)).code).toBe(0);
      expect(fs.paths()).not.toContain('shop/libs/.gitkeep');

      // The second one finds nothing to remove, and says nothing of it.
      const parsed = parseArgs(['g', 'lib', 'kit', ...flags, '--cwd', SHOP]);
      if (parsed.kind !== 'lib') throw new Error(parsed.kind);
      const { planLib } = await import('../../src/plans/lib.js');
      const plan = await planLib('kit', parsed.opts, fs);
      expect(plan.errors).toEqual([]);
      expect('deletions' in plan).toBe(false);
    });

    it(`${kind} --dry-run lists it, and removes nothing`, async () => {
      const fs = await shop();
      const { code, out } = await cli(fs, 'g', 'lib', 'ui', ...flags, '--dry-run', '--cwd', SHOP);
      expect(code).toBe(0);
      expect(out).toMatch(/delete\s+libs\/\.gitkeep/u);
      expect(fs.paths()).toContain('shop/libs/.gitkeep');
    });
  }
});
