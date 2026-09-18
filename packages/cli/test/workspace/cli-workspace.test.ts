/**
 * `--workspace` from argv through to the disk, and the guard rail a scaffold puts on every
 * file it writes.
 */

import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../src/args.js';
import { run, type RunDeps } from '../../src/run.js';
import { scaffoldChanges } from '../../src/plans/scaffold.js';
import { FUD_TARGET_EXISTS } from '../../src/diagnostics.js';
import { captureStreams, MemoryFs, RecordingRunner } from '../helpers.js';

const CWD = '/here';

function deps(fs: MemoryFs): RunDeps & { capture: ReturnType<typeof captureStreams> } {
  const capture = captureStreams();
  return { readIo: fs, writeIo: fs, runner: new RecordingRunner(), streams: capture.streams, capture };
}

describe('parseArgs, fudic new --workspace', () => {
  it('is its own command, not a flag on new', () => {
    const parsed = parseArgs(['new', 'tienda', '--workspace']);

    expect(parsed.kind).toBe('workspace');
    expect(parsed.kind === 'workspace' && parsed.opts.app).toBe('tienda');
  });

  it('--app names the first app, and the id follows the app', () => {
    const parsed = parseArgs(['new', 'mi-tienda', '--workspace', '--app', 'web']);

    expect(parsed.kind === 'workspace' && parsed.opts.app).toBe('web');
    expect(parsed.kind === 'workspace' && parsed.opts.id).toBe('web');
  });

  it('--id still wins over the default when it is given', () => {
    const parsed = parseArgs(['new', 'mi-tienda', '--workspace', '--app', 'web', '--id', 'shop']);

    expect(parsed.kind === 'workspace' && parsed.opts.id).toBe('shop');
  });

  it('without --workspace it is still plain new: --app is not read', () => {
    const parsed = parseArgs(['new', 'tienda']);

    expect(parsed.kind).toBe('new');
  });
});

describe('fudic new --workspace, run end to end', () => {
  it('writes the workspace and installs at its root', async () => {
    const fs = new MemoryFs({}, CWD);
    const d = deps(fs);

    expect(await run(['new', 'tienda', '--workspace', '--cwd', CWD, '--no-git'], d)).toBe(0);
    expect(fs.paths()).toContain('tienda/pnpm-workspace.yaml');
    expect(fs.paths()).toContain('tienda/apps/tienda/fudic.json');
  });
});

describe('parseArgs, fudic g app and fudic g lib', () => {
  it('g app defaults to apps/, and its id to the name it was given', () => {
    const parsed = parseArgs(['g', 'app', 'admin']);

    expect(parsed.kind).toBe('app');
    expect(parsed.kind === 'app' && parsed.opts.dir).toBe('apps');
    expect(parsed.kind === 'app' && parsed.opts.id).toBe('admin');
    expect(parsed.kind === 'app' && parsed.opts.sw).toBe(true);
    expect(parsed.kind === 'app' && parsed.opts.uses).toEqual([]);
  });

  it('g a is the alias', () => {
    expect(parseArgs(['g', 'a', 'admin']).kind).toBe('app');
  });

  it('g app takes --dir, --id, --prefix, --no-sw and a repeatable --uses', () => {
    const parsed = parseArgs([
      'g', 'app', 'admin',
      '--dir', 'sites', '--id', 'back', '--prefix', 'ad', '--no-sw',
      '--uses', 'ui', '--uses', 'theme',
    ]);

    expect(parsed.kind === 'app' && parsed.opts).toMatchObject({
      dir: 'sites',
      id: 'back',
      prefix: 'ad',
      sw: false,
      uses: ['ui', 'theme'],
    });
  });

  it('g lib defaults to libs/ and has no id to take', () => {
    const parsed = parseArgs(['g', 'lib', 'ui', '--prefix', 'ui']);

    expect(parsed.kind).toBe('lib');
    expect(parsed.kind === 'lib' && parsed.opts.dir).toBe('libs');
    expect(parsed.kind === 'lib' && parsed.opts.prefix).toBe('ui');
  });

  it('rejects --id on a library: it has no identity to declare', () => {
    const parsed = parseArgs(['g', 'lib', 'ui', '--id', 'ui']);

    expect(parsed.kind).toBe('error');
  });

  it('rejects an unknown flag on g app', () => {
    expect(parseArgs(['g', 'app', 'admin', '--layout', 'x']).kind).toBe('error');
  });

  it('names both in the message for an unknown type', () => {
    const parsed = parseArgs(['g', 'widget', 'x']);

    expect(parsed.kind === 'error' && parsed.error.message).toContain('app, lib');
  });
});

describe('fudic g app and g lib, run end to end', () => {
  function inWorkspace(): MemoryFs {
    return new MemoryFs(
      {
        'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - 'libs/*'\n",
        'package.json': '{"name":"mi-tienda","private":true}',
      },
      CWD,
    );
  }

  it('adds an app', async () => {
    const fs = inWorkspace();
    const d = deps(fs);

    expect(await run(['g', 'app', 'admin', '--cwd', CWD], d)).toBe(0);
    expect(fs.paths()).toContain('apps/admin/fudic.json');
  });

  it('adds a library', async () => {
    const fs = inWorkspace();
    const d = deps(fs);

    expect(await run(['g', 'lib', 'ui', '--cwd', CWD, '--prefix', 'ui'], d)).toBe(0);
    expect(fs.paths()).toContain('libs/ui/package.json');
  });

  it('exits 1 outside a workspace, having written nothing', async () => {
    const fs = new MemoryFs({ 'README.md': '#' }, CWD);
    const d = deps(fs);

    expect(await run(['g', 'lib', 'ui', '--cwd', CWD], d)).toBe(1);
    expect(fs.paths()).toEqual(['README.md']);
    expect(d.capture.stdout()).toContain('FUD0780');
  });
});

describe('scaffoldChanges', () => {
  /**
   * A scaffold never writes over a file it did not create. The whole-directory refusal
   * catches the common case earlier, but that one only looks at the root: a directory that
   * holds no `fudic.json` is not a project, so `fudic g app` will walk straight past it into
   * this guard with whatever stray files are inside.
   */
  it('reports an existing file instead of silently skipping it', () => {
    const fs = new MemoryFs({ 'apps/admin/README.md': 'mine' }, CWD);

    const result = scaffoldChanges(
      { cwd: CWD, force: false },
      [
        ['apps/admin/README.md', 'generated'],
        ['apps/admin/package.json', '{}'],
      ],
      fs,
    );

    expect(result.errors.map((error) => error.code)).toEqual([FUD_TARGET_EXISTS]);
    expect(result.changes.map((change) => change.path)).toEqual(['apps/admin/package.json']);
  });

  it('overwrites with --force, and says it is a modification', () => {
    const fs = new MemoryFs({ 'apps/admin/README.md': 'mine' }, CWD);

    const result = scaffoldChanges(
      { cwd: CWD, force: true },
      [['apps/admin/README.md', 'generated']],
      fs,
    );

    expect(result.errors).toEqual([]);
    expect(result.changes[0]).toMatchObject({ kind: 'modify', before: 'mine' });
  });
});
