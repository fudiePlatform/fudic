/**
 * `runTests`: a project's unit tests run by vitest in this process, answered as a report. The
 * project is `run-project/`: its own config and tests, some red on purpose — four green and two
 * red of an assertion in `counter`, a `mount` that throws in `broken`, a `.fud` that does not
 * compile under `loop`, and in `late` an assertion and a throw from a helper's timer.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { LAST_TEST_REPORT, runTests, type BrokenTest, type FailedTest, type TestReport } from '../src/run.js';

const ROOT = fileURLToPath(new URL('./run-project/', import.meta.url));
const BROKEN_ROOT = fileURLToPath(new URL('./run-broken/', import.meta.url));
const LAST = `${ROOT}${LAST_TEST_REPORT}`;

/** A vitest run inside a test is a whole run: seconds, not milliseconds. */
const SLOW = 120_000;

const forget = (root: string): void => rmSync(`${root}.fudic`, { recursive: true, force: true });

const entry = (report: TestReport, name: string | null, file?: string): FailedTest | BrokenTest =>
  report.tests.find((t) => t.name === name && (file === undefined || t.file === file))!;

describe('a whole run', () => {
  let report: TestReport;
  beforeAll(async () => {
    forget(ROOT);
    report = await runTests({ root: ROOT });
  }, SLOW);

  test('criterion 15 — the good red: the line of the expect, quoted, with expected and actual', () => {
    expect(entry(report, 'x-counter > a press counts nothing')).toEqual({
      verdict: 'fail',
      file: 'tests/counter.test.ts',
      name: 'x-counter > a press counts nothing',
      at: { file: 'tests/counter.test.ts', line: 30, column: 21 },
      quote: 'expect(pressed).toBe(0);',
      expected: '0',
      actual: '1',
      message: 'expected 1 to be +0 // Object.is equality',
    });
  });

  test('criterion 16 — a jest-dom matcher that says no is a fail too, its message without colours', () => {
    const disabled = entry(report, 'x-counter > the button is disabled') as FailedTest;
    expect(disabled).toMatchObject({
      verdict: 'fail',
      at: { file: 'tests/counter.test.ts', line: 35 },
      quote: "expect(t.getByRole('button', { name: '+' })).toBeDisabled();",
      message: 'expect(element).toBeDisabled()',
    });
    // A matcher of `expect.extend` gives no expected and no actual: none is invented.
    expect(disabled).not.toHaveProperty('expected');
    expect(disabled).not.toHaveProperty('actual');
  });

  test('criterion 17 — a mount that throws is broken, with its line and a diagnostic', () => {
    expect(entry(report, 'mounts with a function as its start')).toMatchObject({
      verdict: 'broken',
      file: 'tests/broken.test.ts',
      at: { file: 'tests/broken.test.ts', line: 7 },
      quote: 'const t = await mount(XCounter, { props: { start: () => 1 } });',
      diagnostics: [{ code: 'FUD1207', message: expect.stringContaining('prop "start" is not JSON') }],
    });
  });

  test('criterion 17 — a file that imports a .fud that does not compile: no name, the FUD0540 at its place in the .fud', () => {
    expect(entry(report, null, 'tests/loop.test.ts')).toEqual({
      verdict: 'broken',
      file: 'tests/loop.test.ts',
      name: null,
      diagnostics: [
        {
          code: 'FUD0540',
          severity: 'error',
          message: "a loop must declare 'key (…)'",
          file: 'src/x-loop.fud',
          line: 8,
          column: 16,
        },
      ],
    });
  });

  test('criterion 18 — only what did not pass is listed; four green and two red count 4/2/0', () => {
    expect(report.files.find((f) => f.file === 'tests/counter.test.ts')).toEqual({
      file: 'tests/counter.test.ts',
      pass: 4,
      fail: 2,
      broken: 0,
      skipped: 0,
    });
    expect(report.tests.filter((t) => t.file === 'tests/counter.test.ts')).toHaveLength(2);
    expect(report.tests.every((t) => t.verdict !== ('pass' as never))).toBe(true);
  });

  test('the files in path order, and the summary their sum', () => {
    expect(report.files.map((f) => f.file)).toEqual([
      'tests/broken.test.ts',
      'tests/counter.test.ts',
      'tests/late.test.ts',
      'tests/loop.test.ts',
    ]);
    expect(report.summary).toEqual({ pass: 4, fail: 3, broken: 3, skipped: 0 });
  });

  test('what fails outside every test file has no line of the test: an assertion at 1:1, a throw at none', () => {
    expect(entry(report, 'an assertion of a helper')).toMatchObject({
      verdict: 'fail',
      at: { file: 'tests/late.test.ts', line: 1, column: 1 },
      quote: '',
      expected: 'on time',
      actual: 'late',
    });
    const thrown = entry(report, 'a throw of a helper') as BrokenTest;
    expect(thrown).toMatchObject({ verdict: 'broken', diagnostics: [{ code: 'FUD1207', message: 'could not run: nothing here' }] });
    expect(thrown).not.toHaveProperty('at');
  });

  test('the report is kept for the next run', () => {
    expect(JSON.parse(readFileSync(LAST, 'utf8'))).toEqual(report);
  });
});

describe('criterion 19 — names and failing', () => {
  test('names: only the tests whose full name contains one, written with " > " as the report writes it', async () => {
    forget(ROOT);
    const report = await runTests({ root: ROOT, paths: ['tests/counter.test.ts'], names: ['x-counter > starts at zero'] });
    expect(report.files).toEqual([{ file: 'tests/counter.test.ts', pass: 1, fail: 0, broken: 0, skipped: 5 }]);
    expect(report.tests).toEqual([]);
  }, SLOW);

  test('failing: a file that did not load runs whole, the tests that failed run by their names', async () => {
    forget(ROOT);
    await runTests({ root: ROOT });
    const report = await runTests({ root: ROOT, failing: true });
    expect(report.files).toEqual([
      { file: 'tests/broken.test.ts', pass: 0, fail: 0, broken: 1, skipped: 0 },
      { file: 'tests/counter.test.ts', pass: 0, fail: 2, broken: 0, skipped: 4 },
      { file: 'tests/late.test.ts', pass: 0, fail: 1, broken: 1, skipped: 0 },
      { file: 'tests/loop.test.ts', pass: 0, fail: 0, broken: 1, skipped: 0 },
    ]);
    expect(report.summary).toEqual({ pass: 0, fail: 3, broken: 3, skipped: 4 });
  }, SLOW);

  test('failing with no report before runs everything', async () => {
    forget(ROOT);
    const report = await runTests({ root: ROOT, failing: true });
    expect(report.summary).toEqual({ pass: 4, fail: 3, broken: 3, skipped: 0 });
  }, SLOW);

  test('failing after a run where everything passed runs nothing', async () => {
    forget(ROOT);
    mkdirSync(`${ROOT}.fudic/runs`, { recursive: true });
    writeFileSync(LAST, JSON.stringify({ summary: { pass: 6, fail: 0, broken: 0, skipped: 0 }, tests: [], files: [], ms: 1 }));
    const report = await runTests({ root: ROOT, failing: true });
    expect(report.summary).toEqual({ pass: 0, fail: 0, broken: 0, skipped: 0 });
    expect(report.files).toEqual([]);
  }, SLOW);
});

test('a vitest that cannot start: no throw, one broken entry with FUD1207', async () => {
  forget(BROKEN_ROOT);
  const report = await runTests({ root: BROKEN_ROOT });
  expect(report.summary).toEqual({ pass: 0, fail: 0, broken: 1, skipped: 0 });
  expect(report.tests).toEqual([
    {
      verdict: 'broken',
      file: '.',
      name: null,
      diagnostics: [
        {
          code: 'FUD1207',
          severity: 'error',
          message: expect.stringContaining('could not run:'),
          file: null,
          line: null,
          column: null,
        },
      ],
    },
  ]);
  forget(BROKEN_ROOT);
}, SLOW);
