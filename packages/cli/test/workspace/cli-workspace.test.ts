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
