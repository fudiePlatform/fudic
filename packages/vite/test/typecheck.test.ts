/**
 * How the build says a typecheck (SDD-35 §4.4): every problem one block, the project's first,
 * then ONE line the build fails with — `N errors in M files` — or none when nothing breaks it.
 *
 * Unit-level over hand-made reports: the real check is `@fudic/typecheck`'s and is exercised
 * end to end by `build-typecheck.test.ts`; what is the build's own here is the wording and
 * the counting, and every branch of them is reachable from a report alone.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FUD0870, FUD0871, span } from '@fudic/diagnostics';
import { toPosix, type CheckProblem, type CheckReport, type ProjectProblem } from '@fudic/typecheck';
import { summarize } from '../src/typecheck.js';

const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-summarize-')));
mkdirSync(join(root, 'src'), { recursive: true });
const a = `${root}/src/a.fud`;
const b = `${root}/src/b.fud`;
writeFileSync(a, 'const n: number = "x";\n');
writeFileSync(b, 'let x = 1;\n');

const problem = (file: string, severity: CheckProblem['severity'] = 'error', code = 'TS2322'): CheckProblem => ({
  file,
  span: span(6, 7),
  severity,
  code,
  message: `${code} message`,
});

const report = (problems: readonly CheckProblem[], project: readonly ProjectProblem[] = []): CheckReport => ({
  problems,
  project,
  inputs: [],
});

describe('summarize — the blocks', () => {
  it('a clean report says nothing and does not fail', () => {
    expect(summarize(report([]), root)).toEqual({ blocks: [], failure: undefined });
  });

  it('a problem is its formatted block, relative path, line, column and frame', () => {
    const { blocks } = summarize(report([problem(a)]), root);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.severity).toBe('error');
    expect(blocks[0]!.text.split('\n')[0]).toBe('src/a.fud:1:7 - error TS2322: TS2322 message');
    expect(blocks[0]!.text).toContain('  1  const n: number = "x";');
  });

  it('a file it cannot read gives the head line alone', () => {
    const gone = `${root}/src/gone.fud`;
    const { blocks } = summarize(report([problem(gone)]), root);
    expect(blocks[0]!.text).toBe(`${gone} - error TS2322: TS2322 message`);
  });

  it('`read` is the port it reads through', () => {
    const { blocks } = summarize(report([problem(a)]), root, () => 'abcdefghij\n');
    expect(blocks[0]!.text).toContain('  1  abcdefghij');
  });

  it('the project’s problems come first; an info of the project is not printed', () => {
    const info: ProjectProblem = { severity: 'info', code: 'FUD0872', message: 'not printed' };
    const { blocks } = summarize(report([problem(a, 'warning')], [FUD0870(), info]), root);
    expect(blocks.map((block) => block.severity)).toEqual(['warning', 'warning']);
    expect(blocks[0]!.text).toContain('warning FUD0870');
    expect(blocks.map((block) => block.text).join('\n')).not.toContain('not printed');
  });
});

describe('summarize — the one line the build fails with', () => {
  it('warnings only: nothing breaks the build', () => {
    expect(summarize(report([problem(a, 'warning')], [FUD0870()]), root).failure).toBeUndefined();
  });

  it('one error in one file, singular both', () => {
    expect(summarize(report([problem(a)]), root).failure).toBe('the typecheck failed: 1 error in 1 file');
  });

  it('several errors in several files, plural both; warnings do not count', () => {
    const failure = summarize(
      report([problem(a), problem(a, 'error', 'TS2304'), problem(b), problem(b, 'warning')]),
      root,
    ).failure;
    expect(failure).toBe('the typecheck failed: 3 errors in 2 files');
  });

  it('a check that could not run is an error of no file (FUD0871)', () => {
    const summary = summarize(report([], [FUD0871({ reason: 'boom' })]), root);
    expect(summary.failure).toBe('the typecheck failed: 1 error');
    expect(summary.blocks[0]!.text).toContain('error FUD0871: the typecheck could not run: boom');
  });

  it('project errors add to the count of file errors', () => {
    const failure = summarize(report([problem(a)], [FUD0871({ reason: 'x' }), FUD0871({ reason: 'y' })]), root)
      .failure;
    expect(failure).toBe('the typecheck failed: 3 errors in 1 file');
  });
});
