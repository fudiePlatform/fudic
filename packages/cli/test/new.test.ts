/**
 * `fudic new` — acceptance criteria §6.11 (`--target` deferred), §6.14 (commands live in
 * the plan) and the shape of the generated tree that §6.1 then builds for real.
 */

import { describe, expect, it } from 'vitest';
import { planNew } from '../src/plans/new.js';
import { apply } from '../src/apply.js';
import { parseFud } from '../src/parse.js';
import { FUD_ADAPTER_UNAVAILABLE, FUD_TARGET_EXISTS } from '../src/diagnostics.js';
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
      'demo/layouts/_layout.fud',
      'demo/routes/index.fud',
    ]);
    expect(plan.changes.every((change) => change.kind === 'create')).toBe(true);

    const layout = plan.changes.find((change) => change.path === 'demo/layouts/_layout.fud')!.contents;
    const index = plan.changes.find((change) => change.path === 'demo/routes/index.fud')!.contents;
    expect(parseFud(layout).doc.type).toBe('layout-document');
    expect(parseFud(index).doc.type).toBe('route-document');
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
      'git init',
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
