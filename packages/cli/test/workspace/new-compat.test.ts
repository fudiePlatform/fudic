/**
 * `fudic new` WITHOUT `--workspace` is untouched — criteria 2 and 3.
 *
 * This SDD refactored the app tree into a builder both commands share (`plans/scaffold.ts`),
 * which is exactly the kind of change that moves a byte nobody looks at. So the whole tree is
 * snapshotted here, contents included: any drift in what a standalone project gets, from any
 * later change, fails this file rather than someone's `pnpm create`.
 *
 * The two files the workspace moves to its root — `tsconfig.json` and `fudic-globals.d.ts` —
 * are asserted on their own besides, because they are the ones §4.6 had a reason to touch.
 */

import { describe, expect, it } from 'vitest';
import { GLOBALS_DTS, GLOBALS_FILE_NAME } from '@fudic/language-core';
import { planNew } from '../../src/plans/new.js';
import { planWorkspace } from '../../src/plans/workspace.js';
import { findProjects } from '../../src/workspace/discover.js';
import { apply } from '../../src/apply.js';
import { MemoryFs, RecordingRunner } from '../helpers.js';
import type { NewOptions, WorkspaceOptions } from '../../src/types.js';

const CWD = '/here';

function options(overrides: Partial<NewOptions> = {}): NewOptions {
  return {
    cwd: CWD,
    force: false,
    id: 'demo',
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

/** Every generated file, path → contents, as one object a snapshot can hold. */
function tree(fs: MemoryFs): Record<string, string> {
  return Object.fromEntries(fs.paths().map((path) => [path, fs.at(path)]));
}

describe('fudic new, without --workspace', () => {
  it('writes the standalone tree, byte for byte (criterion 2)', async () => {
    const fs = new MemoryFs({}, CWD);
    await apply(await planNew('demo', options(), fs), options(), fs, new RecordingRunner());

    expect(tree(fs)).toMatchSnapshot();
  });

  it('keeps its own tsconfig.json: no extends, no workspace above it', async () => {
    const fs = new MemoryFs({}, CWD);
    await apply(await planNew('demo', options(), fs), options(), fs, new RecordingRunner());
    const tsconfig = JSON.parse(fs.at('demo/tsconfig.json')) as Record<string, unknown>;

    expect(tsconfig['extends']).toBeUndefined();
    expect(tsconfig['compilerOptions']).toMatchObject({ strict: true });
    expect(tsconfig['include']).toContain(GLOBALS_FILE_NAME);
  });

  it('keeps its own fudic-globals.d.ts', async () => {
    const fs = new MemoryFs({}, CWD);
    await apply(await planNew('demo', options(), fs), options(), fs, new RecordingRunner());

    expect(fs.at(`demo/${GLOBALS_FILE_NAME}`)).toBe(GLOBALS_DTS);
  });

  it('carries the fudic.json SDD-41 gave it, and nothing from this SDD', async () => {
    const fs = new MemoryFs({}, CWD);
    await apply(await planNew('demo', options(), fs), options(), fs, new RecordingRunner());

    expect(JSON.parse(fs.at('demo/fudic.json'))).toEqual({ id: 'demo', kind: 'app' });
    expect(fs.paths()).not.toContain('demo/pnpm-workspace.yaml');
    expect(fs.paths()).not.toContain('demo/tsconfig.base.json');
  });

  it('is itself the project: findProjects over it returns one', async () => {
    const fs = new MemoryFs({}, CWD);
    await apply(await planNew('demo', options(), fs), options(), fs, new RecordingRunner());

    expect(findProjects(`${CWD}/demo`, fs).map((project) => project.name)).toEqual(['demo']);
  });
});

describe('the app of a workspace and a standalone app', () => {
  it('differ in exactly the two files §4.6 moves to the root', async () => {
    const standalone = new MemoryFs({}, CWD);
    await apply(await planNew('demo', options(), standalone), options(), standalone, new RecordingRunner());

    const wsOpts: WorkspaceOptions = { ...options(), app: 'demo' };
    const workspace = new MemoryFs({}, CWD);
    await apply(await planWorkspace('ws', wsOpts, workspace), wsOpts, workspace, new RecordingRunner());

    const standaloneFiles = standalone.paths().map((path) => path.slice('demo/'.length));
    const appFiles = workspace
      .paths()
      .filter((path) => path.startsWith('ws/apps/demo/'))
      .map((path) => path.slice('ws/apps/demo/'.length));

    expect(standaloneFiles.filter((file) => !appFiles.includes(file))).toEqual([GLOBALS_FILE_NAME]);
    expect(appFiles.filter((file) => !standaloneFiles.includes(file))).toEqual([]);

    // Of the files both have, three differ and no more: `tsconfig.json`, because §4.6 put
    // the strict config and the globals at the root; and `package.json` with the `README.md`
    // that quotes it, because a package inside a workspace is named under its scope.
    const differing = appFiles.filter(
      (file) => workspace.at(`ws/apps/demo/${file}`) !== standalone.at(`demo/${file}`),
    );
    expect(differing).toEqual(['README.md', 'package.json', 'tsconfig.json']);
  });
});
