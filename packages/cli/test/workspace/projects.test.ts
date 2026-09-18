/**
 * `fudic g app` and `fudic g lib` — criteria 4, 5 and 6.
 *
 * The point the two of them make together is §1.2: a library is not an app with things taken
 * away. What it lacks is everything needed to SERVE an application, and it publishes its
 * `.fud` sources rather than a build.
 */

import { describe, expect, it } from 'vitest';
import { planApp } from '../../src/plans/app.js';
import { planLib } from '../../src/plans/lib.js';
import { apply } from '../../src/apply.js';
import {
  FUD_NOT_A_WORKSPACE,
  FUD_PROJECT_EXISTS,
} from '../../src/diagnostics.js';
import { FUD_CONFIG_DUPLICATE_ID } from '@fudic/config';
import { MemoryFs, RecordingRunner } from '../helpers.js';
import type { AppOptions, Plan, ProjectOptions } from '../../src/types.js';

const ROOT = '/ws';

/** A workspace with one app already in it — the state `fudic new --workspace` leaves. */
function workspace(extra: Readonly<Record<string, string>> = {}): MemoryFs {
  return new MemoryFs(
    {
      'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - 'libs/*'\n",
      'package.json': '{"name":"mi-tienda","private":true}',
      'apps/tienda/fudic.json': '{"id":"tienda","kind":"app","prefix":"sh"}',
      'apps/tienda/package.json': '{"name":"@mi-tienda/tienda"}',
      ...extra,
    },
    ROOT,
  );
}

function appOptions(overrides: Partial<AppOptions> = {}): AppOptions {
  return { cwd: ROOT, force: false, dir: 'apps', prefix: '', uses: [], id: 'admin', sw: true, ...overrides };
}

function libOptions(overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return { cwd: ROOT, force: false, dir: 'libs', prefix: '', uses: [], ...overrides };
}

/** Apply a plan and hand back the filesystem, so assertions read against real files. */
async function applied(plan: Plan, fs: MemoryFs): Promise<MemoryFs> {
  await apply(plan, { cwd: ROOT, force: false }, fs, new RecordingRunner());
  return fs;
}

describe('fudic g app (criterion 4)', () => {
  it('adds apps/admin with its vite config, its sw.json and its fudic.json', async () => {
    const fs = workspace();
    const plan = await planApp('admin', appOptions({ prefix: 'ad' }), fs);
    expect(plan.errors).toEqual([]);
    await applied(plan, fs);

    expect(fs.paths()).toContain('apps/admin/vite.config.ts');
    expect(fs.paths()).toContain('apps/admin/sw.json');
    expect(JSON.parse(fs.at('apps/admin/fudic.json'))).toEqual({
      id: 'admin',
      kind: 'app',
      prefix: 'ad',
    });
  });

  it('leaves the app that was already there untouched', async () => {
    const fs = workspace();
    const before = fs.at('apps/tienda/fudic.json');
    const plan = await planApp('admin', appOptions(), fs);

    expect(plan.changes.every((change) => change.path.startsWith('apps/admin/'))).toBe(true);
    await applied(plan, fs);
    expect(fs.at('apps/tienda/fudic.json')).toBe(before);
  });

  it('names the package under the scope the workspace root declares', async () => {
    const fs = workspace();
    await applied(await planApp('admin', appOptions(), fs), fs);

    expect(JSON.parse(fs.at('apps/admin/package.json'))['name']).toBe('@mi-tienda/admin');
  });

  it('points at the root tsconfig and writes no second fudic-globals.d.ts', async () => {
    const fs = workspace();
    await applied(await planApp('admin', appOptions(), fs), fs);

    expect(JSON.parse(fs.at('apps/admin/tsconfig.json'))['extends']).toBe('../../tsconfig.base.json');
    expect(fs.paths().filter((path) => path.endsWith('fudic-globals.d.ts'))).toEqual([]);
  });

  it('hangs from the workspace root even when run from inside another app', async () => {
    const fs = workspace();
    const plan = await planApp('admin', appOptions({ cwd: `${ROOT}/apps/tienda` }), fs);

    expect(plan.changes.map((change) => change.path)).toContain('../admin/fudic.json');
  });

  it('--no-sw leaves the app without a Service Worker policy', async () => {
    const fs = workspace();
    const plan = await planApp('admin', appOptions({ sw: false }), fs);

    expect(plan.changes.map((change) => change.path)).not.toContain('apps/admin/sw.json');
  });

  it('refuses outside a workspace: FUD0780', async () => {
    const fs = new MemoryFs({ 'fudic.json': '{"id":"solo","kind":"app"}' }, ROOT);

    const plan = await planApp('admin', appOptions(), fs);

    expect(plan.changes).toEqual([]);
    expect(plan.errors[0]?.code).toBe(FUD_NOT_A_WORKSPACE);
  });

  it('refuses a name the workspace already uses: FUD0784', async () => {
    const plan = await planApp('tienda', appOptions({ id: 'otra' }), workspace());

    expect(plan.changes).toEqual([]);
    expect(plan.errors[0]?.code).toBe(FUD_PROJECT_EXISTS);
  });

  it('refuses a directory that already holds a fudic.json it cannot read', async () => {
    const fs = workspace({ 'apps/admin/fudic.json': '{ not json' });

    const plan = await planApp('admin', appOptions(), fs);

    expect(plan.errors[0]?.code).toBe(FUD_PROJECT_EXISTS);
  });

  it('--force overwrites a project that is already there', async () => {
    const fs = workspace();
    const plan = await planApp('tienda', appOptions({ id: 'tienda', force: true }), fs);

    expect(plan.errors).toEqual([]);
    expect(plan.changes.some((change) => change.kind === 'modify')).toBe(true);
  });

  it('refuses an id another project already claims: FUD0724 (§4.4)', async () => {
    const plan = await planApp('admin', appOptions({ id: 'tienda' }), workspace());

    expect(plan.changes).toEqual([]);
    expect(plan.errors[0]?.code).toBe(FUD_CONFIG_DUPLICATE_ID);
  });

  it('refuses an id its own reader would reject, before writing anything', async () => {
    const plan = await planApp('admin', appOptions({ id: 'Admin' }), workspace());

    expect(plan.changes).toEqual([]);
    expect(plan.errors[0]?.file).toBe('fudic.json');
  });
});

describe('fudic g lib (criterion 5)', () => {
  it('publishes the .fud sources: exports and files point at them, never at a dist', async () => {
    const fs = workspace();
    await applied(await planLib('ui', libOptions({ prefix: 'ui' }), fs), fs);
    const pkg = JSON.parse(fs.at('libs/ui/package.json')) as Record<string, unknown>;

    expect(pkg['name']).toBe('@mi-tienda/ui');
    expect(pkg['type']).toBe('module');
    expect(pkg['exports']).toMatchObject({ './*.fud': './src/components/*.fud' });
    expect(pkg['files']).toContain('src');
    expect(JSON.stringify(pkg)).not.toContain('dist');
    expect(pkg['scripts']).toBeUndefined();
  });

  it('names @fudic/core as a PEER, because a runtime cannot be copied', async () => {
    const fs = workspace();
    await applied(await planLib('ui', libOptions(), fs), fs);
    const pkg = JSON.parse(fs.at('libs/ui/package.json')) as Record<string, unknown>;

    // That it must be named at all was found by installing and building for real: the client
    // chunk of a library component imports the runtime, and that import resolves from the
    // file making it, which lives in the library. That it must be a PEER is what keeps a
    // library published to npm from bringing its own second copy alongside the app's — two
    // copies mean two registrations of the same tag and two sets of signals that never see
    // each other. The devDependency is what lets the library be built on its own.
    expect(pkg['peerDependencies']).toMatchObject({ '@fudic/core': expect.any(String) });
    expect(pkg['devDependencies']).toMatchObject({ '@fudic/core': expect.any(String) });
    expect(pkg['dependencies']).toBeUndefined();
  });

  it('declares kind lib and carries no id: it has no caches', async () => {
    const fs = workspace();
    await applied(await planLib('ui', libOptions({ prefix: 'ui' }), fs), fs);

    expect(JSON.parse(fs.at('libs/ui/fudic.json'))).toEqual({ kind: 'lib', prefix: 'ui' });
  });

  it('has an empty src/components and a tsconfig that extends the root', async () => {
    const fs = workspace();
    await applied(await planLib('ui', libOptions(), fs), fs);

    expect(fs.paths()).toContain('libs/ui/src/components/.gitkeep');
    expect(JSON.parse(fs.at('libs/ui/tsconfig.json'))['extends']).toBe('../../tsconfig.base.json');
  });

  it('writes none of the four things that belong to an app (§4.5)', async () => {
    const plan = await planLib('ui', libOptions(), workspace());
    const written = plan.changes.map((change) => change.path);

    expect(written).not.toContain('libs/ui/vite.config.ts');
    expect(written).not.toContain('libs/ui/sw.json');
    expect(written.some((path) => path.includes('src/routes'))).toBe(false);
    expect(written.some((path) => path.includes('src/layouts'))).toBe(false);
  });

  it('refuses outside a workspace, exactly as g app does', async () => {
    const fs = new MemoryFs({ 'fudic.json': '{"id":"solo","kind":"app"}' }, ROOT);

    expect((await planLib('ui', libOptions(), fs)).errors[0]?.code).toBe(FUD_NOT_A_WORKSPACE);
  });
});

describe('fudic g lib without --prefix (criterion 6)', () => {
  it('writes the library the same, with a fudic.json that has no prefix', async () => {
    const fs = workspace();
    const plan = await planLib('ui', libOptions(), fs);
    expect(plan.errors).toEqual([]);
    await applied(plan, fs);

    expect(JSON.parse(fs.at('libs/ui/fudic.json'))).toEqual({ kind: 'lib' });
    expect(fs.paths()).toContain('libs/ui/package.json');
    expect(fs.paths()).toContain('libs/ui/src/components/.gitkeep');
  });
});
