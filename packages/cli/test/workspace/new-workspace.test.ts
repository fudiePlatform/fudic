/**
 * `fudic new <nombre> --workspace` — criterion 1.
 *
 * The root of §4.1 AND a first app, because a workspace with no app does not build, cannot
 * be tried and teaches nothing (§4.2).
 */

import { describe, expect, it } from 'vitest';
import { GLOBALS_DTS, GLOBALS_FILE_NAME } from '@fudic/language-core';
import { planWorkspace } from '../../src/plans/workspace.js';
import { findProjects } from '../../src/workspace/discover.js';
import { apply } from '../../src/apply.js';
import { FUD_TARGET_EXISTS } from '../../src/diagnostics.js';
import { MemoryFs, RecordingRunner } from '../helpers.js';
import type { WorkspaceOptions } from '../../src/types.js';

const CWD = '/here';

function options(overrides: Partial<WorkspaceOptions> = {}): WorkspaceOptions {
  return {
    cwd: CWD,
    force: false,
    app: 'tienda',
    id: 'tienda',
    prefix: '',
    pm: 'pnpm',
    install: true,
    git: true,
    sw: true,
    layout: '_layout',
    target: 'static',
    ...overrides,
  };
}

describe('fudic new --workspace', () => {
  it('writes the root of §4.1 and the first app under apps/', async () => {
    const plan = await planWorkspace('tienda', options(), new MemoryFs({}, CWD));

    expect(plan.errors).toEqual([]);
    expect(plan.changes.map((change) => change.path)).toEqual([
      'tienda/package.json',
      'tienda/pnpm-workspace.yaml',
      'tienda/tsconfig.base.json',
      `tienda/${GLOBALS_FILE_NAME}`,
      'tienda/.gitignore',
      'tienda/apps/tienda/package.json',
      'tienda/apps/tienda/vite.config.ts',
      'tienda/apps/tienda/README.md',
      'tienda/apps/tienda/.gitignore',
      'tienda/apps/tienda/fudic.json',
      'tienda/apps/tienda/tsconfig.json',
      'tienda/apps/tienda/sw.json',
      'tienda/apps/tienda/src/layouts/_layout.fud',
      'tienda/apps/tienda/src/routes/index.fud',
    ]);
    expect(plan.changes.every((change) => change.kind === 'create')).toBe(true);
  });

  it('declares apps/* and libs/* to pnpm, which is the only list of packages there is', async () => {
    const fs = new MemoryFs({}, CWD);
    await apply(await planWorkspace('tienda', options(), fs), options(), fs, new RecordingRunner());

    expect(fs.at('tienda/pnpm-workspace.yaml')).toContain("- 'apps/*'");
    expect(fs.at('tienda/pnpm-workspace.yaml')).toContain("- 'libs/*'");
  });

  it('gives the root a private package.json with no production dependencies', async () => {
    const fs = new MemoryFs({}, CWD);
    await apply(await planWorkspace('tienda', options(), fs), options(), fs, new RecordingRunner());
    const root = JSON.parse(fs.at('tienda/package.json')) as Record<string, unknown>;

    expect(root['private']).toBe(true);
    expect(root['dependencies']).toBeUndefined();
    // The build of the workspace is the build of its packages; criterion 13 runs this.
    expect(root['scripts']).toMatchObject({ build: 'pnpm -r build' });
  });

  it('writes fudic-globals.d.ts once, at the root, and points the app at it (§4.6)', async () => {
    const fs = new MemoryFs({}, CWD);
    await apply(await planWorkspace('tienda', options(), fs), options(), fs, new RecordingRunner());

    expect(fs.at(`tienda/${GLOBALS_FILE_NAME}`)).toBe(GLOBALS_DTS);
    expect(fs.paths().filter((path) => path.endsWith(GLOBALS_FILE_NAME))).toHaveLength(1);

    const tsconfig = JSON.parse(fs.at('tienda/apps/tienda/tsconfig.json')) as Record<string, unknown>;
    expect(tsconfig['extends']).toBe('../../tsconfig.base.json');
    expect(tsconfig['include']).toContain(`../../${GLOBALS_FILE_NAME}`);
  });

  it('gives the app its fudic.json, with the id it was given', async () => {
    const fs = new MemoryFs({}, CWD);
    const opts = options({ id: 'tienda', prefix: 'sh' });
    await apply(await planWorkspace('tienda', opts, fs), opts, fs, new RecordingRunner());

    expect(JSON.parse(fs.at('tienda/apps/tienda/fudic.json'))).toEqual({
      id: 'tienda',
      kind: 'app',
      prefix: 'sh',
    });
  });

  it('--app names the first app, which need not be the workspace name', async () => {
    const plan = await planWorkspace('mi-tienda', options({ app: 'web', id: 'web' }), new MemoryFs({}, CWD));

    expect(plan.changes.map((change) => change.path)).toContain('mi-tienda/apps/web/fudic.json');
  });

  it('installs and commits at the workspace root, not inside the app', async () => {
    const plan = await planWorkspace('tienda', options(), new MemoryFs({}, CWD));

    expect(plan.commands.map((command) => `${command.command} ${command.args[0]} @ ${command.dir}`)).toEqual([
      'pnpm install @ tienda',
      'git init @ tienda',
      'git add @ tienda',
      'git commit @ tienda',
    ]);
  });

  it('refuses a directory that is already taken, exactly as fudic new does', async () => {
    const fs = new MemoryFs({ 'tienda/README.md': '#' }, CWD);

    const plan = await planWorkspace('tienda', options(), fs);

    expect(plan.changes).toEqual([]);
    expect(plan.errors[0]?.code).toBe(FUD_TARGET_EXISTS);
  });

  it('the root is not a fudic project: findProjects sees the app and only the app (criterion 3)', async () => {
    const fs = new MemoryFs({}, CWD);
    await apply(await planWorkspace('tienda', options(), fs), options(), fs, new RecordingRunner());

    expect(fs.paths()).not.toContain('tienda/fudic.json');
    expect(findProjects(`${CWD}/tienda`, fs).map((project) => project.name)).toEqual(['tienda']);
  });
});
