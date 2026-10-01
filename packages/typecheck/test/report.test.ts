/**
 * The order and the format of a report (SDD-35 §4.4, §4.6).
 *
 * Two runs over the same tree have to print the same text byte for byte, so every tie in the
 * order is broken by something that does not depend on the order TypeScript returned things in.
 */

import { describe, expect, it } from 'vitest';
import {
  compareProblems,
  formatProblem,
  hasErrors,
  locateProblem,
  relativePath,
  type CheckProblem,
  type CheckReport,
} from '../src/index.js';

const problem = (over: Partial<CheckProblem> = {}): CheckProblem => ({
  file: '/p/src/a.fud',
  span: { start: 10, end: 14 },
  severity: 'error',
  code: 'TS2322',
  message: 'm',
  ...over,
});

describe('compareProblems', () => {
  it('orders by path, then offset, then code, then end, then message', () => {
    const shuffled = [
      problem({ message: 'z' }),
      problem({ span: { start: 10, end: 20 } }),
      problem({ code: 'FUD0460' }),
      problem({ span: { start: 2, end: 3 } }),
      problem({ file: '/p/src/b.fud', span: { start: 0, end: 1 } }),
      problem(),
    ];
    const sorted = [...shuffled].sort(compareProblems);

    expect(sorted.map((p) => `${p.file}|${p.span.start}|${p.code}|${p.span.end}|${p.message}`)).toEqual([
      '/p/src/a.fud|2|TS2322|3|m',
      '/p/src/a.fud|10|FUD0460|14|m',
      '/p/src/a.fud|10|TS2322|14|m',
      '/p/src/a.fud|10|TS2322|14|z',
      '/p/src/a.fud|10|TS2322|20|m',
      '/p/src/b.fud|0|TS2322|1|m',
    ]);
  });

  it('is zero for two identical problems', () => {
    expect(compareProblems(problem(), problem())).toBe(0);
  });
});

describe('hasErrors', () => {
  const report = (over: Partial<CheckReport>): CheckReport => ({ problems: [], project: [], inputs: [], ...over });

  it('is false for a clean report and for warnings only', () => {
    expect(hasErrors(report({}))).toBe(false);
    expect(
      hasErrors(
        report({
          problems: [problem({ severity: 'warning' })],
          project: [{ code: 'FUD0870', severity: 'warning', message: 'w' }],
        }),
      ),
    ).toBe(false);
  });

  it('is true for an error of a file or of the project', () => {
    expect(hasErrors(report({ problems: [problem()] }))).toBe(true);
    expect(hasErrors(report({ project: [{ code: 'FUD0871', severity: 'error', message: 'e' }] }))).toBe(true);
  });
});

describe('relativePath', () => {
  it('is relative under the root, whatever slashes either is spelt with', () => {
    expect(relativePath('C:\\p\\src\\a.fud', 'C:/p')).toBe('src/a.fud');
  });

  it('is the path itself outside the root, and for a sibling that only shares a prefix', () => {
    expect(relativePath('/q/a.fud', '/p')).toBe('/q/a.fud');
    expect(relativePath('/pp/a.fud', '/p')).toBe('/pp/a.fud');
  });
});

describe('formatProblem', () => {
  const SOURCE = 'line one\n  <app-badge .tone="@(42)"></app-badge>\n';
  const at = SOURCE.indexOf('tone');
  const tone = problem({ span: { start: at, end: at + 4 }, message: "Type 'number' is not assignable." });

  it('prints path:line:col, severity, code and message, then the frame', () => {
    const text = formatProblem(tone, '/p', SOURCE);
    const [head, blank, gutter, underline] = text.split('\n');

    expect(head).toBe("src/a.fud:2:15 - error TS2322: Type 'number' is not assignable.");
    expect(blank).toBe('');
    expect(gutter).toContain('<app-badge .tone="@(42)"></app-badge>');
    // The underline sits under `tone` and is made of a non-word character (SDD-35 §4.4).
    expect(underline?.trim()).toBe('────');
    expect(underline?.indexOf('─')).toBe(gutter?.indexOf('tone'));
    expect(text).not.toContain('diagnostic#');
  });

  it('links a fudic code to its explanation', () => {
    const text = formatProblem({ ...tone, code: 'FUD0460', severity: 'warning' }, '/p', SOURCE);

    expect(text.split('\n')[0]).toMatch(/^src\/a\.fud:2:15 - warning FUD0460: /u);
    expect(text).toMatch(/diagnostic#FUD0460$/u);
  });

  it('locates with 1-based lines and columns', () => {
    expect(locateProblem(tone, SOURCE).start).toEqual({ line: 2, column: 15 });
    expect(locateProblem(tone, SOURCE).end).toEqual({ line: 2, column: 19 });
  });
});
