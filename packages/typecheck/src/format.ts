/**
 * A problem as a terminal shows it (SDD-35 §4.4):
 *
 *     src/routes/index.fud:12:15 - error TS2322: Type 'number' is not assignable to …
 *
 *       12  <app-badge .tone="@(42)"></app-badge>
 *                      ────
 *
 * Line, column and frame come from `@fudic/diagnostics`' `locate`, the one place an offset
 * becomes a line; a fudic code also gets the link to its explanation, as `format` prints it.
 */

import { docsUrl, locate, type FudCode, type Located } from '@fudic/diagnostics';
import type { CheckProblem } from './report.js';
import { toPosix } from './paths.js';

/** Whether a problem's code is one of fudic's, and so has an explanation to link. */
function isFudCode(code: string): code is FudCode {
  return /^FUD\d{4}$/u.test(code);
}

/** POSIX path of `file` relative to `root`, or `file` itself when it is not under it. */
export function relativePath(file: string, root: string): string {
  const posix = toPosix(file);
  const base = toPosix(root);
  return posix.startsWith(`${base}/`) ? posix.slice(base.length + 1) : posix;
}

/** Where a problem is, for a human: 1-based line and column, and the frame. */
export function locateProblem(problem: CheckProblem, source: string): Located {
  return locate(source, problem.span);
}

/** `path:line:col - error TS2322: message` plus the code frame, for a terminal. */
export function formatProblem(problem: CheckProblem, root: string, source: string): string {
  const at = locateProblem(problem, source);
  const head =
    `${relativePath(problem.file, root)}:${at.start.line}:${at.start.column} - ` +
    `${problem.severity} ${problem.code}: ${problem.message}`;
  const parts = [head, '', at.frame];
  if (isFudCode(problem.code)) parts.push('', `  ${docsUrl(problem.code)}`);
  return parts.join('\n');
}
