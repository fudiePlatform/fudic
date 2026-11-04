/**
 * `fudic_check`: what the build would say, without building. The pass is always the whole
 * project — a change in a component breaks whoever uses it —; `paths` only narrows the list.
 */

import { isAbsolute, relative } from 'node:path';
import { FUD1404, type FileDiagnostic } from '@fudic/diagnostics';
import type { CheckReport } from '@fudic/typecheck';
import type { Checks } from './checks.js';
import { outDiagnostic, type Problem } from './diagnostics.js';
import { locate } from './locate.js';
import { isFudicProject, type Project } from './project.js';
import { read, type Answer } from './respond.js';

export interface CheckInput {
  readonly paths?: readonly string[];
  readonly limit: number;
}

/**
 * The problems of a report, the project's first, as the tools report them. Fixable is one
 * repair and only one: what can be applied without choosing; several are the caller's options.
 */
export async function problemsOf(report: CheckReport, checks: Checks): Promise<readonly Problem[]> {
  const located = await Promise.all(
    report.problems.map(async (p): Promise<Problem> => {
      const repairs = await checks.repairs(p);
      return { ...p, fixable: repairs.length === 1, ...(repairs.length > 1 ? { options: repairs.map((r) => r.title) } : {}) };
    }),
  );
  return [...report.project.filter((p) => p.severity === 'error' || p.severity === 'warning'), ...located];
}

/** Whether a problem is in one of `under`: the file itself, or a folder that holds it. One of the project always is. */
export function inside(problem: Problem, under: readonly string[]): boolean {
  if (problem.file === undefined || under.length === 0) return true;
  const file = problem.file;
  return under.some((path) => {
    const rel = relative(path, file);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  });
}

/** The folders and files a tool was asked about, absolute; or the first that is refused. */
export function located(root: string, paths: readonly string[] = []): { readonly under: readonly string[] } | { readonly error: FileDiagnostic } {
  const under: string[] = [];
  for (const path of paths) {
    const one = locate(root, path);
    if ('error' in one) return one;
    under.push(one.path);
  }
  return { under };
}

/** What a check found, counted: everything, whatever the list shows. */
export function summaryOf(problems: readonly Problem[]): Readonly<Record<string, number>> {
  return {
    errors: problems.filter((p) => p.severity === 'error').length,
    warnings: problems.filter((p) => p.severity === 'warning').length,
    fixable: problems.filter((p) => p.fixable === true).length,
    files: new Set(problems.flatMap((p) => (p.file === undefined ? [] : [p.file]))).size,
  };
}

/** The one next step: nothing, `fudic_fix`, or the first error by its position. */
export function nextOf(problems: readonly Problem[], root: string): string | null {
  const errors = problems.filter((p) => p.severity === 'error');
  if (errors.length === 0) return null;
  const fixable = errors.filter((p) => p.fixable === true).length;
  if (fixable > 0) return `Run fudic_fix for the ${fixable} fixable diagnostics, then fix the rest by hand.`;
  const first = outDiagnostic(errors[0]!, root, read);
  const where = first.at === undefined ? '' : ` at ${first.at}`;
  return `Fix ${first.code}${where}, then run fudic_check again.`;
}

export async function checkProject(project: Project, checks: Checks, input: CheckInput): Promise<Answer> {
  if (!isFudicProject(project.root)) {
    return { body: {}, diagnostics: [FUD1404({ folder: project.root })], failed: true };
  }
  const asked = located(project.root, input.paths);
  if ('error' in asked) return { body: {}, diagnostics: [asked.error], failed: true };
  const all = await problemsOf(await checks.run(), checks);
  const listed = all.filter((p) => inside(p, asked.under));
  return { body: { summary: summaryOf(all) }, diagnostics: listed.slice(0, input.limit), next: nextOf(all, project.root) };
}
