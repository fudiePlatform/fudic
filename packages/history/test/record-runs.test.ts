/**
 * SDD-65 §4.3, without running anything: which piece each report goes to, how its counts and
 * verdict are folded, and that the hash is the snapshot's.
 */

import { mkdtempSync, realpathSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inputsHash, nodeIo, parseHistory, recordSpecRun, recordTestRun, snapshot, unitState } from '../src/index.js';
import { memoryIo } from './memory-io.js';

const A = 'src/components/a/a.fud';
const B = 'src/components/b/b.fud';
const FUD = (tag: string): string => `<${tag}>\n  <template shadowrootmode="open"><p></p></template>\n</${tag}>\n`;

const files = { [A]: FUD('x-a'), [B]: FUD('x-b'), 'src/components/c/c.fud': FUD('x-c') };
const events = (q: ReturnType<typeof memoryIo>, log: string) => parseHistory(q.text(log) ?? '').value.map((line) => line.event);

describe('snapshot', () => {
  it('takes the input hash of each piece, keyed relative to the root, as they are now', async () => {
    const q = memoryIo({ files });
    const before = await snapshot([A, `/project/${B}`], q);
    expect([...before.hashes.keys()]).toEqual([A, B]);
    expect(before.hashes.get(A)).toBe(await inputsHash(A, q));
    expect(before.hashes.get(B)).toBe(await inputsHash(B, q));
    expect(before.hashes.get(A)).not.toBe(before.hashes.get(B));
  });
});

describe('recordSpecRun', () => {
  const report = (spec: string, id: string, verdict: 'pass' | 'fail' | 'error') => ({ spec, id, verdict });

  it('writes one line per .fudspec, in its piece, with the folded verdict and the ids that did not pass', async () => {
    const q = memoryIo({ files });
    const before = await snapshot([A, B, 'src/components/c/c.fud'], q);
    await recordSpecRun(
      {
        reports: [
          report('src/components/a/a.fudspec', 'one', 'pass'),
          report('src/components/b/b.fudspec', 'uno', 'fail'),
          report('src/components/a/a.fudspec', 'two', 'error'),
          report('src/components/b/b.fudspec', 'dos', 'pass'),
          report('src/components/a/a.fudspec', 'three', 'fail'),
          report('src/components/c/c.fudspec', 'only', 'pass'),
        ],
      },
      before,
      q,
    );
    expect(events(q, 'src/components/a/a.fudlog')).toEqual([
      { kind: 'spec_run', verdict: 'error', passed: 1, total: 3, hash: before.hashes.get(A), failing: ['two', 'three'] },
    ]);
    expect(events(q, 'src/components/b/b.fudlog')).toEqual([
      { kind: 'spec_run', verdict: 'fail', passed: 1, total: 2, hash: before.hashes.get(B), failing: ['uno'] },
    ]);
    expect(events(q, 'src/components/c/c.fudlog')).toEqual([
      { kind: 'spec_run', verdict: 'pass', passed: 1, total: 1, hash: before.hashes.get('src/components/c/c.fud'), failing: [] },
    ]);
  });

  it('counts only the criteria that ran, when a run was limited to the failing ones', async () => {
    const q = memoryIo({ files });
    const before = await snapshot([A], q);
    await recordSpecRun({ reports: [report('src/components/a/a.fudspec', 'two', 'pass')] }, before, q);
    expect(events(q, 'src/components/a/a.fudlog')).toEqual([
      { kind: 'spec_run', verdict: 'pass', passed: 1, total: 1, hash: before.hashes.get(A), failing: [] },
    ]);
  });

  it('records nothing for a piece the snapshot did not take, nor for an empty run', async () => {
    const q = memoryIo({ files });
    const before = await snapshot([A], q);
    await recordSpecRun({ reports: [report('src/components/b/b.fudspec', 'uno', 'pass')] }, before, q);
    await recordSpecRun({ reports: [] }, before, q);
    expect(q.files.size).toBe(3);
  });
});

describe('recordTestRun', () => {
  const counts = (file: string, pass: number, fail = 0, broken = 0, skipped = 0) => ({ file, pass, fail, broken, skipped });

  it('sums the sibling test files of each piece, ignoring skipped, and folds broken > red > pass', async () => {
    const q = memoryIo({ files });
    const before = await snapshot([A, B, 'src/components/c/c.fud'], q);
    await recordTestRun(
      {
        files: [
          counts('src/components/a/a.test.ts', 4, 2, 0, 3),
          counts('src/components/b/b.test.ts', 2, 1, 1),
          counts('src/components/c/c.test.ts', 3, 0, 0, 1),
        ],
      },
      before,
      q,
    );
    expect(events(q, 'src/components/a/a.fudlog')).toEqual([
      { kind: 'tests', verdict: 'red', passed: 4, total: 6, hash: before.hashes.get(A) },
    ]);
    expect(events(q, 'src/components/b/b.fudlog')).toEqual([
      { kind: 'tests', verdict: 'broken', passed: 2, total: 4, hash: before.hashes.get(B) },
    ]);
    expect(events(q, 'src/components/c/c.fudlog')).toEqual([
      { kind: 'tests', verdict: 'pass', passed: 3, total: 3, hash: before.hashes.get('src/components/c/c.fud') },
    ]);
  });

  it('leaves out a test that is no sibling of a .fud of the snapshot, and a file that is not a .test.ts', async () => {
    const q = memoryIo({ files });
    const before = await snapshot([A], q);
    await recordTestRun(
      {
        files: [
          counts('src/services/clock.test.ts', 1),
          counts('src/components/a/a.spec.ts', 0, 1),
          counts('src/components/b/b.test.ts', 0, 1),
          counts('src/components/a/a.test.ts', 2),
        ],
      },
      before,
      q,
    );
    expect([...q.files.keys()].filter((path) => path.endsWith('.fudlog'))).toEqual(['/project/src/components/a/a.fudlog']);
    expect(events(q, 'src/components/a/a.fudlog')).toEqual([
      { kind: 'tests', verdict: 'pass', passed: 2, total: 2, hash: before.hashes.get(A) },
    ]);
  });
});

describe('by default, on the disk of the working directory', () => {
  it('snapshots, records and reads the state there', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'fudic-history-cwd-')));
    const cwd = process.cwd();
    try {
      mkdirSync(join(root, 'src/components/a'), { recursive: true });
      writeFileSync(join(root, A), FUD('x-a'));
      process.chdir(root);
      const before = await snapshot([A]);
      await recordTestRun({ files: [{ file: 'src/components/a/a.test.ts', pass: 1, fail: 0, broken: 0 }] }, before);
      await recordSpecRun({ reports: [{ spec: 'src/components/a/a.fudspec', id: 'x', verdict: 'pass' }] }, before);
      const state = await unitState(A);
      expect(state.tests).toEqual({ state: 'pass', passed: 1, total: 1 });
      expect(state.spec).toEqual({ state: 'pass', passed: 1, total: 1 });
      expect(await unitState(A, nodeIo(root))).toEqual(state);
    } finally {
      process.chdir(cwd);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
