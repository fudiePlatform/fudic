/**
 * BUG-51 — the dev typecheck in a child process (`startLiveChecker`), and the checker in this
 * process that takes over when the child dies (`resilientChecker`).
 *
 * The real script runs once, over a small project with a type error. The rest is driven by
 * scripts of the test's own: one that answers and remembers what it was told, one that answers
 * out of order, one that dies at the first check, one that never answers.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toPosix, type CheckReport } from '@fudic/typecheck';
import {
  LIVE_CHECK_SCRIPT,
  resilientChecker,
  startLiveChecker as start,
  type LiveChecker,
  type SyncChecker,
} from '../src/live-checker.js';
import { writeTypecheckConfig } from './helpers/alias.js';

/** A child script of the test's own, written to a temp folder. */
function script(source: string): URL {
  const dir = mkdtempSync(join(tmpdir(), 'fudic-livecheck-script-'));
  const file = join(dir, 'child.mjs');
  writeFileSync(file, source);
  return pathToFileURL(file);
}

/** Every child a test starts, killed before the next test: none outlives the file. */
const started: LiveChecker[] = [];
const startLiveChecker = (...args: Parameters<typeof start>): LiveChecker => {
  const checker = start(...args);
  started.push(checker);
  return checker;
};

afterEach(() => {
  for (const checker of started.splice(0)) checker.dispose();
});

/** Answers every check with the root it was started for and every path it was told of. */
const ECHO = script(`
const told = [];
process.on('message', (m) => {
  if (m.type === 'invalidate') told.push(m.path);
  else process.send({ id: m.id, report: { problems: [], project: [], inputs: [process.argv[2], ...told] } });
});
process.on('disconnect', () => process.exit(0));
`);

describe('startLiveChecker', () => {
  it('runs the real check in a child process that stays, and hands back each report', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fudic-livecheck-'));
    writeTypecheckConfig(root);
    mkdirSync(join(root, 'src', 'routes'), { recursive: true });
    const index = join(root, 'src', 'routes', 'index.fud');
    writeFileSync(index, `@code {\n  const n: number = 'no';\n}\n<!DOCTYPE html><html><head><title>x</title></head><body>@n</body></html>\n`);
    const checker = startLiveChecker(root);

    const broken = await checker.check();
    expect(broken.problems).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'TS2322', file: expect.stringMatching(/\/src\/routes\/index\.fud$/u) }),
    );

    // The same child, told what changed, checks again.
    writeFileSync(index, `@code {\n  const n: number = 1;\n}\n<!DOCTYPE html><html><head><title>x</title></head><body>@n</body></html>\n`);
    // In the spelling the dev server hands it: posix, as `startLiveCheck` does.
    checker.invalidate(toPosix(index));
    const fixed = await checker.check();
    expect(fixed.problems.map((p) => p.code)).not.toContain('TS2322');
  }, 120000);

  it('is the script one directory above `src`, next to the one above `dist`', () => {
    expect(LIVE_CHECK_SCRIPT.href).toMatch(/\/worker\/live-check\.mjs$/u);
  });

  it('resolves each check with the report of its own id, given the root and what was invalidated', async () => {
    const checker = startLiveChecker('/the/project', ECHO);
    expect((await checker.check()).inputs).toEqual(['/the/project']);
    checker.invalidate('/the/project/src/a.fud');
    expect((await checker.check()).inputs).toEqual(['/the/project', '/the/project/src/a.fud']);
  });

  it('matches the answers by id, whatever order they come in — and ignores one nobody asked for', async () => {
    const checker = startLiveChecker(
      '/p',
      script(`
const asked = [];
process.on('message', (m) => {
  asked.push(m.id);
  if (asked.length < 2) return;
  process.send({ id: 99, report: { problems: [], project: [], inputs: ['nobody'] } });
  for (const id of asked.reverse()) process.send({ id, report: { problems: [], project: [], inputs: [String(id)] } });
});
process.on('disconnect', () => process.exit(0));
`),
    );
    const [first, second] = await Promise.all([checker.check(), checker.check()]);
    expect(first.inputs).toEqual(['0']);
    expect(second.inputs).toEqual(['1']);
  });

  it('a child that exits rejects what was pending, and every check after it', async () => {
    const checker = startLiveChecker('/p', script(`process.on('message', () => process.exit(3));\n`));
    await expect(checker.check()).rejects.toThrow('the typecheck process ended (exit code 3)');
    await expect(checker.check()).rejects.toThrow('the typecheck process ended (exit code 3)');
    // Nothing to tell a child that is gone, and nothing thrown for trying.
    expect(() => checker.invalidate('/p/a.fud')).not.toThrow();
  });

  it('dispose kills the child, and what was pending is rejected with the signal', async () => {
    const checker = startLiveChecker('/p', script(`process.on('message', () => {});\nsetInterval(() => {}, 1000);\n`));
    const pending = checker.check();
    checker.dispose();
    await expect(pending).rejects.toThrow(/the typecheck process ended \(SIG/u);
  });
});

describe('resilientChecker', () => {
  const CLEAN: CheckReport = { problems: [], project: [], inputs: [] };
  const LOCAL: CheckReport = { problems: [], project: [], inputs: ['local'] };

  function fakes(liveCheck: () => Promise<CheckReport>) {
    const live = { check: vi.fn(liveCheck), invalidate: vi.fn(), dispose: vi.fn() };
    const sync: SyncChecker = { check: vi.fn(() => LOCAL), invalidate: vi.fn() };
    const local = vi.fn(() => Promise.resolve(sync));
    return { live, sync, local, checker: resilientChecker(live, local) };
  }

  it('uses the child while it lives, and never loads the local one', async () => {
    const { live, local, checker } = fakes(() => Promise.resolve(CLEAN));
    expect(await checker.check()).toBe(CLEAN);
    checker.invalidate('/p/a.fud');
    expect(live.invalidate).toHaveBeenCalledWith('/p/a.fud');
    expect(local).not.toHaveBeenCalled();
  });

  it('at the first rejection, answers with a local checker it makes once and keeps for good', async () => {
    const { live, sync, local, checker } = fakes(() => Promise.reject(new Error('the typecheck process ended')));
    expect(await checker.check()).toBe(LOCAL);
    expect(await checker.check()).toBe(LOCAL);
    expect(local).toHaveBeenCalledTimes(1);
    // The child is not asked again once it failed.
    expect(live.check).toHaveBeenCalledTimes(1);

    checker.invalidate('/p/a.fud');
    await Promise.resolve();
    expect(sync.invalidate).toHaveBeenCalledWith('/p/a.fud');
    expect(live.invalidate).not.toHaveBeenCalled();
  });

  it('dispose stops the child', () => {
    const { live, checker } = fakes(() => Promise.resolve(CLEAN));
    checker.dispose();
    expect(live.dispose).toHaveBeenCalledTimes(1);
  });
});
