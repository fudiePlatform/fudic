/**
 * What a check reports (SDD-35 §3.1, §4.6): problems in `.fud` coordinates, in a stable order.
 */

import type { Span } from '@fudic/compiler';
import type { ProjectDiagnostic } from '@fudic/diagnostics';

/** One problem, already in `.fud` coordinates. */
export interface CheckProblem {
  /** Absolute POSIX path of the file. */
  readonly file: string;
  readonly span: Span;
  readonly severity: 'error' | 'warning';
  /** `FUD0123` for fudic, `TS2322` for TypeScript. */
  readonly code: string;
  readonly message: string;
}

/** A problem of the project and not of a file: `FUD0870`, `FUD0871`. */
export type ProjectProblem = ProjectDiagnostic;

export interface CheckReport {
  /** Sorted: path, then offset, then code (§4.6). */
  readonly problems: readonly CheckProblem[];
  /** Problems without a file: `FUD0870`, `FUD0871`. */
  readonly project: readonly ProjectProblem[];
  /** Every file the program read, `.fud` and not: what `dev` must watch. */
  readonly inputs: readonly string[];
}

/**
 * The order of §4.6: path relative to the root, then offset, then code.
 *
 * The code is the tie-break that makes two runs byte-identical: two diagnostics at the same
 * offset otherwise come out in the order TypeScript returned them, which is not stable across
 * versions. A plain comparison and not `localeCompare`, which depends on the machine's locale.
 */
export function compareProblems(a: CheckProblem, b: CheckProblem): number {
  return (
    compareText(a.file, b.file) ||
    a.span.start - b.span.start ||
    compareText(a.code, b.code) ||
    a.span.end - b.span.end ||
    compareText(a.message, b.message)
  );
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Whether any problem — of a file or of the project — breaks the build. */
export function hasErrors(report: CheckReport): boolean {
  return (
    report.problems.some((problem) => problem.severity === 'error') ||
    report.project.some((problem) => problem.severity === 'error')
  );
}
