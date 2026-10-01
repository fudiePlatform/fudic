/**
 * The typecheck of a build (SDD-35 §4.4): what the editor marks, before anything is compiled.
 *
 * The check itself is `@fudic/typecheck`'s — the machine the language server runs. What is the
 * build's is how it says the result: every problem printed in full, then ONE failure with a
 * summary, so the author sees the whole list in the first run instead of one error per build.
 */

import { readFileSync } from 'node:fs';
import { format } from '@fudic/diagnostics';
import {
  formatProblem,
  hasErrors,
  type CheckProblem,
  type CheckReport,
} from '@fudic/typecheck';

/** One block of terminal text, and whether it breaks the build. */
export interface ReportBlock {
  readonly severity: 'error' | 'warning';
  readonly text: string;
}

/** What a check says, ready for a terminal. */
export interface CheckSummary {
  /** Every problem, one block each, in the report's order: the project's first. */
  readonly blocks: readonly ReportBlock[];
  /** `2 errors in 2 files`, or `undefined` when nothing breaks the build. */
  readonly failure: string | undefined;
}

/** How a report reads in a terminal. `read` gives a file's text, for line, column and frame. */
export function summarize(
  report: CheckReport,
  root: string,
  read: (file: string) => string | undefined = readText,
): CheckSummary {
  const blocks: ReportBlock[] = [];
  for (const problem of report.project) {
    if (problem.severity !== 'error' && problem.severity !== 'warning') continue;
    blocks.push({ severity: problem.severity, text: format(problem, { root }) });
  }
  for (const problem of report.problems) {
    blocks.push({ severity: problem.severity, text: problemText(problem, root, read) });
  }
  return { blocks, failure: hasErrors(report) ? failureOf(report) : undefined };
}

/** A problem as the terminal shows it; without its file's text, the head line alone. */
function problemText(problem: CheckProblem, root: string, read: (file: string) => string | undefined): string {
  const source = read(problem.file);
  return source === undefined
    ? `${problem.file} - ${problem.severity} ${problem.code}: ${problem.message}`
    : formatProblem(problem, root, source);
}

/** `N errors in M files`: the one line the build fails with. */
function failureOf(report: CheckReport): string {
  const errors = report.problems.filter((problem) => problem.severity === 'error');
  const projectErrors = report.project.filter((problem) => problem.severity === 'error').length;
  const files = new Set(errors.map((problem) => problem.file)).size;
  const count = errors.length + projectErrors;
  const noun = count === 1 ? 'error' : 'errors';
  if (files === 0) return `the typecheck failed: ${count} ${noun}`;
  return `the typecheck failed: ${count} ${noun} in ${files} ${files === 1 ? 'file' : 'files'}`;
}

function readText(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}
