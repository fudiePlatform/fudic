/**
 * SDD-65 criteria 8–11 (§3.4, §4.3): `snapshot`, a real `runTests` or `runSpecs` (SDD-64), and
 * `recordTestRun` or `recordSpecRun`, on a throwaway project. Vitest and the browser really run.
 */

import { runTests } from '@fudic/testing/run';
import { isFailure, runSpecs } from '@fudic/workbench';
import { afterEach, describe, expect, it } from 'vitest';
import { inputsHash, nodeIo, parseHistory, recordSpecRun, recordTestRun, snapshot, unitState } from '../src/index.js';
import { BROKEN, BUTTON, LOG, project, RED, TEST, UNIT, type Project } from './project.js';

/** A vitest run or a browser inside a test is a whole run: seconds, not milliseconds. */
const SLOW = 180_000;

let p: Project | undefined;

afterEach(() => {
  p?.remove();
  p = undefined;
});

/** The `.fudlog` of the button, read. */
const history = (q: Project) => parseHistory(q.read(LOG), LOG);

describe('a green that expires (criterion 8)', () => {
  it('records tests pass 6/6, and the state goes stale when the .fud changes', async () => {
    p = project('green');
    const io = nodeIo(p.root);
    const before = await snapshot([UNIT], io);
    const report = await runTests({ root: p.root });
    expect(report.summary).toMatchObject({ pass: 6, fail: 0, broken: 0 });
    await recordTestRun(report, before, io);

    const { value, diagnostics } = history(p);
    expect(diagnostics).toEqual([]);
    expect(value.map((line) => line.event)).toEqual([
      { kind: 'tests', verdict: 'pass', passed: 6, total: 6, hash: before.hashes.get(UNIT) },
    ]);
    expect((await unitState(UNIT, io)).tests).toEqual({ state: 'pass', passed: 6, total: 6 });

    p.write(UNIT, BUTTON.replace('<button', '<button class="b"'));
    expect((await unitState(UNIT, io)).tests).toEqual({ state: 'stale', last: 'pass' });
  }, SLOW);
});

describe('the red of phase 3 (criterion 9)', () => {
  it('records six new tests failing by an assertion as tests red 0/6', async () => {
    p = project('red');
    p.write(TEST, RED);
    const io = nodeIo(p.root);
    const before = await snapshot([UNIT], io);
    const report = await runTests({ root: p.root });
    expect(report.summary).toMatchObject({ pass: 0, fail: 6, broken: 0 });
    await recordTestRun(report, before, io);
    expect(history(p).value.map((line) => line.event)).toEqual([
      { kind: 'tests', verdict: 'red', passed: 0, total: 6, hash: before.hashes.get(UNIT) },
    ]);
    expect((await unitState(UNIT, io)).tests).toEqual({ state: 'red', passed: 0, total: 6 });
  }, SLOW);

  it('records a test file that does not load as broken', async () => {
    p = project('broken');
    p.write(TEST, BROKEN);
    const io = nodeIo(p.root);
    const before = await snapshot([UNIT], io);
    const report = await runTests({ root: p.root });
    expect(report.summary.broken).toBeGreaterThan(0);
    await recordTestRun(report, before, io);
    const [line] = history(p).value;
    expect(line!.event).toMatchObject({ kind: 'tests', verdict: 'broken', passed: 0 });
    expect((await unitState(UNIT, io)).tests).toMatchObject({ state: 'broken', passed: 0 });
  }, SLOW);

  it('leaves out a test that is no sibling of a .fud', async () => {
    p = project('services');
    p.write('src/services/clock.test.ts', "import { expect, test } from 'vitest';\ntest('ticks', () => expect(1).toBe(1));\n");
    const io = nodeIo(p.root);
    const before = await snapshot([UNIT], io);
    const report = await runTests({ root: p.root });
    expect(report.files.map((counts) => counts.file)).toContain('src/services/clock.test.ts');
    await recordTestRun(report, before, io);
    // Only the button's six: the service's test went to no history.
    expect(history(p).value.map((line) => line.event)).toEqual([
      { kind: 'tests', verdict: 'pass', passed: 6, total: 6, hash: before.hashes.get(UNIT) },
    ]);
  }, SLOW);
});

describe('the hash is the one before (criterion 11)', () => {
  it('a file that changes between snapshot and recordTestRun does not change the line, and the state is stale', async () => {
    p = project('during');
    const io = nodeIo(p.root);
    const before = await snapshot([UNIT], io);
    const report = await runTests({ root: p.root });
    // Someone saves the .fud while the run goes.
    p.write(UNIT, BUTTON.replace('<output', '<output class="o"'));
    const now = await inputsHash(UNIT, io);
    expect(now).not.toBe(before.hashes.get(UNIT));
    await recordTestRun(report, before, io);
    const [line] = history(p).value;
    expect(line!.event).toMatchObject({ kind: 'tests', verdict: 'pass', hash: before.hashes.get(UNIT) });
    expect((await unitState(UNIT, io)).tests).toEqual({ state: 'stale', last: 'pass' });
  }, SLOW);
});

describe('spec_run (criterion 10)', () => {
  it('records fail 3/4 with the id of the red criterion after a real runSpecs', async () => {
    p = project('spec');
    const io = nodeIo(p.root);
    const before = await snapshot([UNIT], io);
    const summary = await runSpecs([], { root: p.root });
    if (isFailure(summary)) throw new Error(summary.diagnostic.message);
    expect(summary.reports.map((report) => [report.id, report.verdict])).toEqual([
      ['empieza-en-cero', 'pass'],
      ['suma-uno', 'pass'],
      ['tiene-boton', 'pass'],
      ['cuenta-dos', 'fail'],
    ]);
    await recordSpecRun(summary, before, io);
    expect(history(p).value.map((line) => line.event)).toEqual([
      { kind: 'spec_run', verdict: 'fail', passed: 3, total: 4, hash: before.hashes.get(UNIT), failing: ['cuenta-dos'] },
    ]);
    expect((await unitState(UNIT, io)).spec).toEqual({ state: 'fail', passed: 3, total: 4 });
  }, SLOW);
});
