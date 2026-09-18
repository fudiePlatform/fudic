/**
 * `--uses` — criterion 12.
 *
 * It links PACKAGES and not components (§4.7). The half of this file that matters most is
 * the assertion that nothing wrote a `<link rel="component">`: which component a file uses is
 * the author's call, and `fudic g component --in` is the command for it.
 */

import { describe, expect, it } from 'vitest';
import { planApp } from '../../src/plans/app.js';
import { planLib } from '../../src/plans/lib.js';
import { apply } from '../../src/apply.js';
import { FUD_USES_NOT_A_LIB } from '../../src/diagnostics.js';
import { workspaceScope } from '../../src/workspace/uses.js';
import { MemoryFs, RecordingRunner } from '../helpers.js';
import type { AppOptions, ProjectOptions } from '../../src/types.js';

const ROOT = '/ws';

function workspace(root = '{"name":"mi-tienda","private":true}'): MemoryFs {
  return new MemoryFs(
    {
      'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - 'libs/*'\n",
      'package.json': root,
      'apps/tienda/fudic.json': '{"id":"tienda","kind":"app"}',
      'libs/ui/fudic.json': '{"kind":"lib","prefix":"ui"}',
      'libs/ui/package.json': '{"name":"@mi-tienda/ui"}',
    },
    ROOT,
  );
}

function appOptions(overrides: Partial<AppOptions> = {}): AppOptions {
  return { cwd: ROOT, force: false, dir: 'apps', prefix: '', uses: [], id: 'tienda2', sw: true, ...overrides };
}

function libOptions(overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return { cwd: ROOT, force: false, dir: 'libs', prefix: '', uses: [], ...overrides };
}

describe('fudic g app --uses', () => {
  it('adds the workspace dependency and nothing else', async () => {
    const fs = workspace();
    const plan = await planApp('tienda2', appOptions({ uses: ['ui'] }), fs);
    expect(plan.errors).toEqual([]);
    await apply(plan, { cwd: ROOT, force: false }, fs, new RecordingRunner());

    const pkg = JSON.parse(fs.at('apps/tienda2/package.json')) as Record<string, unknown>;
    expect(pkg['dependencies']).toMatchObject({ '@mi-tienda/ui': 'workspace:*' });

    // The runtime dependencies the scaffold always had are still there beside it.
    expect(pkg['dependencies']).toMatchObject({ '@fudic/core': expect.any(String) });
  });

  it('writes no <link rel="component"> anywhere (§4.7)', async () => {
    const fs = workspace();
    const plan = await planApp('tienda2', appOptions({ uses: ['ui'] }), fs);
    await apply(plan, { cwd: ROOT, force: false }, fs, new RecordingRunner());

    for (const change of plan.changes.filter((candidate) => candidate.path.endsWith('.fud'))) {
      expect(change.contents, change.path).not.toContain('rel="component"');
    }
    // And it modified nothing that was already there: every change is a new file of the
    // new app. A `--uses` that edited a `.fud` would be the thing §4.7 forbids.
    expect(plan.changes.every((change) => change.kind === 'create')).toBe(true);
  });

  it('is repeatable', async () => {
    const fs = workspace();
    fs.write(`${ROOT}/libs/theme/fudic.json`, '{"kind":"lib"}');
    const plan = await planApp('tienda2', appOptions({ uses: ['ui', 'theme'] }), fs);
    await apply(plan, { cwd: ROOT, force: false }, fs, new RecordingRunner());

    expect(JSON.parse(fs.at('apps/tienda2/package.json'))['dependencies']).toMatchObject({
      '@mi-tienda/ui': 'workspace:*',
      '@mi-tienda/theme': 'workspace:*',
    });
  });

  it('rejects an app: FUD0785, because an app exports nothing', async () => {
    const plan = await planApp('tienda2', appOptions({ uses: ['tienda'] }), workspace());

    expect(plan.changes).toEqual([]);
    expect(plan.errors[0]?.code).toBe(FUD_USES_NOT_A_LIB);
    expect(plan.errors[0]?.message).toContain('that is an app');
  });

  it('rejects a name nothing answers to, and says which libraries there are', async () => {
    const plan = await planApp('tienda2', appOptions({ uses: ['nope'] }), workspace());

    expect(plan.errors[0]?.code).toBe(FUD_USES_NOT_A_LIB);
    expect(plan.errors[0]?.message).toContain('libraries: ui');
  });

  it('says so plainly when the workspace has no libraries at all', async () => {
    const fs = new MemoryFs(
      {
        'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n",
        'package.json': '{"name":"mi-tienda"}',
      },
      ROOT,
    );

    const plan = await planApp('tienda2', appOptions({ uses: ['ui'] }), fs);

    expect(plan.errors[0]?.message).toContain('no libraries');
  });
});

describe('fudic g lib --uses', () => {
  it('lets a library depend on another one', async () => {
    const fs = workspace();
    fs.write(`${ROOT}/libs/theme/fudic.json`, '{"kind":"lib"}');
    const plan = await planLib('cards', libOptions({ uses: ['theme'] }), fs);
    await apply(plan, { cwd: ROOT, force: false }, fs, new RecordingRunner());

    expect(JSON.parse(fs.at('libs/cards/package.json'))['dependencies']).toEqual({
      '@mi-tienda/theme': 'workspace:*',
    });
  });

  it('leaves the runtime where it belongs: a peer, not a dependency', async () => {
    const fs = workspace();
    fs.write(`${ROOT}/libs/theme/fudic.json`, '{"kind":"lib"}');
    await apply(
      await planLib('cards', libOptions({ uses: ['theme'] }), fs),
      { cwd: ROOT, force: false },
      fs,
      new RecordingRunner(),
    );
    const pkg = JSON.parse(fs.at('libs/cards/package.json')) as Record<string, unknown>;

    expect(pkg['peerDependencies']).toMatchObject({ '@fudic/core': expect.any(String) });
    expect(Object.keys(pkg['dependencies'] as object)).toEqual(['@mi-tienda/theme']);
  });

  it('has no dependencies key at all without it', async () => {
    const fs = workspace();
    await apply(
      await planLib('cards', libOptions(), fs),
      { cwd: ROOT, force: false },
      fs,
      new RecordingRunner(),
    );

    expect(JSON.parse(fs.at('libs/cards/package.json'))['dependencies']).toBeUndefined();
  });

  it('rejects an app just as g app does', async () => {
    const plan = await planLib('cards', libOptions({ uses: ['tienda'] }), workspace());

    expect(plan.errors[0]?.code).toBe(FUD_USES_NOT_A_LIB);
  });
});

describe('the workspace scope', () => {
  it('is the root package name, turned into a scope', () => {
    expect(workspaceScope(ROOT, workspace())).toBe('@mi-tienda');
  });

  it('is the scope itself when the root is already scoped', () => {
    expect(workspaceScope(ROOT, workspace('{"name":"@acme/monorepo"}'))).toBe('@acme');
  });

  it('is the whole name when the root is a bare scope', () => {
    expect(workspaceScope(ROOT, workspace('{"name":"@acme"}'))).toBe('@acme');
  });

  it('falls back when the root declares an empty name', () => {
    expect(workspaceScope(ROOT, workspace('{"name":""}'))).toBe('@ws');
  });

  it('falls back to the directory when the root declares no name', () => {
    expect(workspaceScope(ROOT, workspace('{"private":true}'))).toBe('@ws');
  });

  it('falls back when the root package.json does not parse — pnpm will say so itself', () => {
    expect(workspaceScope(ROOT, workspace('{ not json'))).toBe('@ws');
  });

  it('falls back when there is no root package.json', () => {
    const fs = new MemoryFs({ 'pnpm-workspace.yaml': 'packages: []' }, ROOT);

    expect(workspaceScope(ROOT, fs)).toBe('@ws');
  });

  it('falls back when the root package.json is not an object', () => {
    expect(workspaceScope(ROOT, workspace('"just a string"'))).toBe('@ws');
  });
});
