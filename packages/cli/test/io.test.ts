/**
 * The command runner, and the one decision inside it: who gets a shell.
 *
 * The `git commit` of the scaffold is spawned for real here, with a message that has spaces
 * in it, because that is the only way the defect this file exists for is observable: with
 * `shell: true` Node joins the argv into one command line without quoting, and the message
 * arrives as separate words. It is a real repository in a temporary directory, so nothing of
 * the workspace is touched.
 */

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { needsShell, nodeCommandRunner } from '../src/io.js';

/** The message `fudic new` commits with: the spaces are the whole point. */
const MESSAGE = 'chore: scaffold fudic app';

describe('needsShell', () => {
  it('gives a shell to the package managers on Windows, and to nothing else', () => {
    // A `.cmd` shim cannot be spawned without one.
    expect(needsShell('pnpm', 'win32')).toBe(true);
    expect(needsShell('npm', 'win32')).toBe(true);
    expect(needsShell('yarn', 'win32')).toBe(true);

    // `git` is a real executable. A shell here loses the quoting of every argument, which is
    // what made `git commit -m "chore: scaffold fudic app"` read three pathspecs.
    expect(needsShell('git', 'win32')).toBe(false);

    // Everywhere else nobody needs one: the shims are a Windows arrangement.
    expect(needsShell('pnpm', 'linux')).toBe(false);
    expect(needsShell('git', 'darwin')).toBe(false);
  });
});

describe('nodeCommandRunner', () => {
  it('commits with the message as ONE argument, spaces included', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fudic-git-'));
    const runner = nodeCommandRunner();

    expect(runner.run('git', ['init', '-b', 'main'], dir)).toBe(0);
    // An identity and no signing, so the commit does not depend on the machine's git config.
    runner.run('git', ['config', 'user.email', 'test@fudic.invalid'], dir);
    runner.run('git', ['config', 'user.name', 'Fudic Test'], dir);
    runner.run('git', ['config', 'commit.gpgsign', 'false'], dir);

    writeFileSync(join(dir, 'README.md'), '# demo\n');
    expect(runner.run('git', ['add', '-A'], dir)).toBe(0);
    expect(runner.run('git', ['commit', '-m', MESSAGE], dir)).toBe(0);

    const subject = spawnSync('git', ['log', '-1', '--format=%s'], { cwd: dir, encoding: 'utf8' });
    expect(subject.stdout.trim()).toBe(MESSAGE);

    // And the branch is the one the plan asks for, not whatever `init.defaultBranch` says.
    const branch = spawnSync('git', ['branch', '--show-current'], { cwd: dir, encoding: 'utf8' });
    expect(branch.stdout.trim()).toBe('main');
  });

  it('reports a non-zero exit, and a command that could not start at all', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fudic-git-'));
    const runner = nodeCommandRunner();

    // Not a repository: git exits non-zero, and the runner says so instead of swallowing it.
    expect(runner.run('git', ['log'], dir)).not.toBe(0);

    // Nothing by this name exists, so the process never started: `null`, not an exit code.
    expect(runner.run('fudic-no-such-binary', [], dir)).toBeNull();
  });
});
