/**
 * `@fudic/typecheck/problems` — what a REPORT is and how it reads, without the machine that
 * produces one.
 *
 * Everything here is free of TypeScript and Volar, which is the reason it is a separate entry:
 * loading `typescript` costs most of a second, and a host that only prints, compares or
 * positions problems — the Vite plugin's reporter, `vite preview` — must not pay it. The check
 * itself stays behind the main entry, imported only when a check is about to run.
 */

export {
  compareProblems,
  hasErrors,
  type CheckProblem,
  type CheckReport,
  type ProjectProblem,
} from './report.js';
export { formatProblem, locateProblem, relativePath } from './format.js';
export { toPosix } from './paths.js';
