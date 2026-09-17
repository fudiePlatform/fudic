/**
 * Discovery (SDD-44 §3.3, §4.3, criterion 3).
 *
 * There is no workspace file listing the projects and there is not going to be one: every
 * assertion here goes through `fudic.json` on the disk, which is the whole rule.
 */

import { describe, expect, it } from 'vitest';
import { findProjects, targetProject, workspaceRoot } from '../../src/workspace/discover.js';
import { MemoryFs } from '../helpers.js';

const ROOT = '/ws';

/** A `fudic.json`, written the way the generators write it. */
function config(fields: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(fields);
}

/** A workspace with two apps and one library, which is the shape §4.1 describes. */
function workspace(): MemoryFs {
  return new MemoryFs(
    {
      'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - 'libs/*'\n",
      'package.json': '{"private":true}',
      'apps/tienda/fudic.json': config({ id: 'tienda', kind: 'app', prefix: 'sh' }),
      'apps/tienda/src/routes/index.fud': '<fud></fud>',
      'apps/admin/fudic.json': config({ id: 'admin', kind: 'app', prefix: 'ad' }),
      'libs/ui/fudic.json': config({ kind: 'lib', prefix: 'ui' }),
      'libs/ui/package.json': '{"name":"@ws/ui"}',
    },
    ROOT,
  );
}

describe('findProjects', () => {
  it('finds every directory that has a fudic.json, and nothing else', () => {
    const found = findProjects(ROOT, workspace());

    expect(found.map((project) => project.name)).toEqual(['admin', 'tienda', 'ui']);
  });

  it('reports the directory name, the absolute root and the parsed config', () => {
    const [admin] = findProjects(ROOT, workspace());

    expect(admin?.name).toBe('admin');
    expect(admin?.path.endsWith('/ws/apps/admin')).toBe(true);
    expect(admin?.config.id).toBe('admin');
    expect(admin?.config.prefix).toBe('ad');
  });

  it('does not count the workspace root: it carries no fudic.json (criterion 3)', () => {
    const fs = new MemoryFs(
      {
        'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n",
        'apps/tienda/fudic.json': config({ id: 'tienda', kind: 'app' }),
      },
      ROOT,
    );

    expect(findProjects(ROOT, fs).map((project) => project.name)).toEqual(['tienda']);
  });

  it('counts the root itself when it is the project: a standalone app is one too', () => {
    const fs = new MemoryFs({ 'fudic.json': config({ id: 'solo', kind: 'app' }) }, ROOT);

    expect(findProjects(ROOT, fs).map((project) => project.name)).toEqual(['ws']);
  });

  it('excludes a project whose fudic.json does not read, and sweeps on', () => {
    const fs = workspace();
    fs.write(`${ROOT}/apps/admin/fudic.json`, '{ not json');

    expect(findProjects(ROOT, fs).map((project) => project.name)).toEqual(['tienda', 'ui']);
  });

  it('never descends into node_modules or dist', () => {
    const fs = workspace();
    fs.write(`${ROOT}/node_modules/@ws/ui/fudic.json`, config({ kind: 'lib' }));
    fs.write(`${ROOT}/apps/tienda/dist/fudic.json`, config({ id: 'ghost', kind: 'app' }));

    expect(findProjects(ROOT, fs).map((project) => project.name)).toEqual(['admin', 'tienda', 'ui']);
  });

  it('is empty where there is no fudic project at all', () => {
    expect(findProjects(ROOT, new MemoryFs({ 'README.md': '#' }, ROOT))).toEqual([]);
  });
});

describe('targetProject', () => {
  it('resolves --project against the directory name', () => {
    const target = targetProject(ROOT, 'ui', workspace());

    expect(target?.name).toBe('ui');
    expect(target?.config.kind).toBe('lib');
  });

  it('resolves --project from inside another project: the sweep starts at the workspace root', () => {
    const target = targetProject(`${ROOT}/apps/tienda`, 'ui', workspace());

    expect(target?.name).toBe('ui');
  });

  it('is null when --project names nothing — the caller turns that into FUD0782', () => {
    expect(targetProject(ROOT, 'noexiste', workspace())).toBeNull();
  });

  it('resolves --project outside a workspace by sweeping from cwd', () => {
    const fs = new MemoryFs({ 'libs/ui/fudic.json': config({ kind: 'lib' }) }, ROOT);

    expect(targetProject(ROOT, 'ui', fs)?.name).toBe('ui');
  });

  it('without --project, takes the nearest fudic.json going up from cwd', () => {
    const target = targetProject(`${ROOT}/apps/tienda/src/routes`, undefined, workspace());

    expect(target?.name).toBe('tienda');
    expect(target?.config.prefix).toBe('sh');
  });

  it('takes the project at cwd when cwd is the project', () => {
    expect(targetProject(`${ROOT}/libs/ui`, undefined, workspace())?.name).toBe('ui');
  });

  it('is null from the workspace root: there is no default project (§4.3)', () => {
    expect(targetProject(ROOT, undefined, workspace())).toBeNull();
  });

  it('is null when the nearest fudic.json does not read', () => {
    const fs = workspace();
    fs.write(`${ROOT}/apps/admin/fudic.json`, '{ not json');

    expect(targetProject(`${ROOT}/apps/admin`, undefined, fs)).toBeNull();
  });
});

describe('workspaceRoot', () => {
  it('is the nearest directory at or above cwd with a pnpm-workspace.yaml', () => {
    const root = workspaceRoot(`${ROOT}/apps/tienda/src`, workspace());

    expect(root?.endsWith('/ws')).toBe(true);
  });

  it('is cwd itself when cwd is the workspace root', () => {
    expect(workspaceRoot(ROOT, workspace())?.endsWith('/ws')).toBe(true);
  });

  it('is null where there is no workspace — that is what FUD0780 reports', () => {
    const fs = new MemoryFs({ 'fudic.json': config({ id: 'solo', kind: 'app' }) }, ROOT);

    expect(workspaceRoot(ROOT, fs)).toBeNull();
  });
});
