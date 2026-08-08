/**
 * `fudic new` — acceptance criteria §6.11 (`--target` deferred), §6.14 (commands live in
 * the plan) and the shape of the generated tree that §6.1 then builds for real.
 */

import { describe, expect, it } from 'vitest';
import { planNew } from '../src/plans/new.js';
import { apply } from '../src/apply.js';
import { parseFud } from '../src/parse.js';
import {
  commandFailed,
  FUD_ADAPTER_UNAVAILABLE,
  FUD_COMMAND_FAILED,
  FUD_TARGET_EXISTS,
} from '../src/diagnostics.js';
import { TYPESCRIPT_VERSION } from '../src/project.js';
import { GLOBALS_DTS } from '@fudic/language-core';
import { MemoryFs, RecordingRunner } from './helpers.js';
import type { NewOptions } from '../src/types.js';

const CWD = '/workspace';

function options(overrides: Partial<NewOptions> = {}): NewOptions {
  return {
    cwd: CWD,
    force: false,
    pm: 'pnpm',
    install: true,
    git: true,
    sw: true,
    layout: '_layout',
    target: 'static',
    ...overrides
  };
}

describe('fudic new', () => {
  it('generates a layout, a root route wired to it, the config and sw.json', async () => {
    const fs = new MemoryFs({}, CWD);
    const plan = await planNew('demo', options(), fs);
    expect(plan.errors).toEqual([]);

    expect(plan.changes.map((change) => change.path)).toEqual([
      'demo/package.json',
      'demo/vite.config.ts',
      'demo/README.md',
      'demo/.gitignore',
      'demo/tsconfig.json',
      'demo/fudic-globals.d.ts',
      'demo/sw.json',
      'demo/src/layouts/_layout.fud',
      'demo/src/routes/index.fud',
    ]);
    expect(plan.changes.every((change) => change.kind === 'create')).toBe(true);

    // §6.1: the source lives under `src/` and the root belongs to the tooling. The list of
    // what may sit outside is written out, not derived — a file that lands in the root from
    // now on has to be added here on purpose, which is the only way this stays a rule.
    const ROOT_FILES = [
      'package.json',
      'vite.config.ts',
      'README.md',
      '.gitignore',
      'tsconfig.json',
      'fudic-globals.d.ts',
      'sw.json',
    ];
    for (const change of plan.changes) {
      const relative = change.path.slice('demo/'.length);
      if (ROOT_FILES.includes(relative)) continue;
      expect(relative, change.path).toMatch(/^src\//u);
    }

    // `.fudic/` is where the build writes the edge wrappers: server code, outside `outDir`
    // so no static host publishes it (BUG-09). Ignoring it is the other half of that —
    // without this line the first build commits `@server` code, and whatever it imports,
    // into the user's repository.
    const gitignore = plan.changes.find((change) => change.path === 'demo/.gitignore')!.contents;
    expect(gitignore).toContain('.fudic/');

    const layout = plan.changes.find((change) => change.path === 'demo/src/layouts/_layout.fud')!.contents;
    const index = plan.changes.find((change) => change.path === 'demo/src/routes/index.fud')!.contents;
    expect(parseFud(layout).doc.type).toBe('layout-document');
    expect(parseFud(index).doc.type).toBe('route-document');
    // §6.2: byte for byte the href it was before the move. The four directories went down
    // together, so no relative depth changed (BUG-20 §4.4).
    expect(index).toContain('<link rel="layout" href="../layouts/_layout.fud">');

    const pkg = JSON.parse(plan.changes[0]!.contents) as { name: string; scripts: Record<string, string> };
    expect(pkg.name).toBe('demo');
    expect(pkg.scripts['build']).toBe('vite build');
  });

  it('writes the ambient globals and a tsconfig that includes the .fud files', async () => {
    const plan = await planNew('demo', options(), new MemoryFs({}, CWD));
    const file = (path: string): string =>
      plan.changes.find((change) => change.path === path)!.contents;

    // The very text the language server mounts in memory: one source, two consumers.
    expect(file('demo/fudic-globals.d.ts')).toBe(GLOBALS_DTS);
    expect(file('demo/fudic-globals.d.ts')).toContain('declare function props<T>(): T;');

    const tsconfig = JSON.parse(file('demo/tsconfig.json')) as {
      include: string[];
      compilerOptions: Record<string, unknown>;
    };
    expect(tsconfig.include).toContain('**/*.fud');
    expect(tsconfig.compilerOptions['exactOptionalPropertyTypes']).toBe(true);

    // The project pins its own TypeScript: the server typechecks with THAT one (SDD-24 §2).
    const pkg = JSON.parse(file('demo/package.json')) as { devDependencies: Record<string, string> };
    expect(pkg.devDependencies['typescript']).toBe(TYPESCRIPT_VERSION);
  });

  it('leaves the generated config empty and shows src/ in the README (§6.3, §6.4)', async () => {
    const plan = await planNew('demo', options(), new MemoryFs({}, CWD));
    const file = (path: string): string => plan.changes.find((change) => change.path === path)!.contents;

    // The scaffold configures nothing because it does not have to: the plugin's default and
    // the directory the CLI just wrote come from the same constant. A generated config that
    // had to declare `routesDir` would be the proof that the two disagree (§4.3).
    expect(file('demo/vite.config.ts')).toContain('plugins: [fudic()]');
    expect(file('demo/vite.config.ts')).not.toContain('routesDir');

    const readme = file('demo/README.md');
    expect(readme).toContain('src/layouts/_layout.fud');
    expect(readme).toContain('src/routes/index.fud');
    expect(readme).toContain('src/components/');
    expect(readme).toContain('fudic g component app-card --in src/routes/index.fud');
  });

  it('--no-sw drops sw.json: the SW itself is never a user file (SDD-20)', async () => {
    const fs = new MemoryFs({}, CWD);
    const plan = await planNew('demo', options({ sw: false }), fs);
    expect(plan.changes.some((change) => change.path.endsWith('sw.json'))).toBe(false);
  });

  it('puts install and git in the plan, and --dry-run runs neither (§6.14)', async () => {
    const fs = new MemoryFs({}, CWD);
    const runner = new RecordingRunner();

    const plan = await planNew('demo', options(), fs);
    expect(plan.commands.map((command) => [command.command, ...command.args].join(' '))).toEqual([
      'pnpm install',
      'git init -b main',
      'git add -A',
      'git commit -m chore: scaffold fudic app',
    ]);

    // A dry run is the plan WITHOUT apply: nothing to undo, nothing spawned.
    expect(fs.paths()).toEqual([]);
    expect(runner.commands).toEqual([]);

    await apply(plan, options(), fs, runner);
    expect(runner.commands).toHaveLength(4);

    const quiet = await planNew('other', options({ install: false, git: false }), fs);
    expect(quiet.commands).toEqual([]);
  });

  it('stops at the first command that fails, and keeps the files it already wrote', async () => {
    const fs = new MemoryFs({}, CWD);
    const runner = new RecordingRunner({ pnpm: 1 });

    const plan = await planNew('demo', options(), fs);
    const applied = await apply(plan, options(), fs, runner);

    // The install failed, so the three `git` commands never ran: they would be noise on top
    // of a tree that does not build.
    expect(runner.commands).toHaveLength(1);
    expect(applied.failed?.status).toBe(1);
    expect(applied.failed?.command.command).toBe('pnpm');

    // The files stay. They are written before any command runs, and taking them away would
    // remove the very tree the user is about to look at.
    expect(applied.changes).toHaveLength(plan.changes.length);
    expect(fs.paths()).toContain('demo/package.json');
  });

  it('reports a command that could never start apart from one that exited non-zero', async () => {
    const fs = new MemoryFs({}, CWD);
    const plan = await planNew('demo', options(), fs);

    const missing = await apply(plan, options(), fs, new RecordingRunner({ pnpm: null }));
    expect(commandFailed(missing.failed!).message).toContain('could not run `pnpm install`');

    const broken = await apply(plan, options(), fs, new RecordingRunner({ pnpm: 1 }));
    expect(commandFailed(broken.failed!).message).toContain('exited with code 1');
    expect(commandFailed(broken.failed!).code).toBe(FUD_COMMAND_FAILED);
  });

  it('rejects an unknown adapter and writes nothing (§6.11)', async () => {
    const fs = new MemoryFs({}, CWD);
    const plan = await planNew('demo', options({ target: 'cloudflare' }), fs);
    expect(plan.changes).toEqual([]);
    expect(plan.commands).toEqual([]);
    expect(plan.errors.map((e) => e.code)).toEqual([FUD_ADAPTER_UNAVAILABLE]);
    expect(plan.errors[0]!.message).toContain("adapter 'cloudflare' is not available");

    const runner = new RecordingRunner();
    await apply(plan, options(), fs, runner);
    expect(fs.paths()).toEqual([]);
    expect(runner.commands).toEqual([]);
  });

  it('--target static behaves exactly like no flag (§6.11)', async () => {
    const fs = new MemoryFs({}, CWD);
    const explicit = await planNew('demo', options({ target: 'static' }), fs);
    const implicit = await planNew('demo', options(), fs);
    expect(explicit.changes).toEqual(implicit.changes);
  });

  it('refuses a non-empty destination without --force', async () => {
    const fs = new MemoryFs({ 'demo/package.json': '{}' }, CWD);
    const plan = await planNew('demo', options(), fs);
    expect(plan.changes).toEqual([]);
    expect(plan.errors.map((e) => e.code)).toEqual([FUD_TARGET_EXISTS]);
  });
});
