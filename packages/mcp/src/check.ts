/**
 * `fudic_check`: what the build would say, without building. The pass is always the whole
 * project — a change in a component breaks whoever uses it —; `paths` only narrows the list.
 */

import { isAbsolute, relative } from 'node:path';
import { FUD1404 } from '@fudic/diagnostics';
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
 * repair and only one: what can be applied without choosing.
 */
export async function problemsOf(report: CheckReport, checks: Checks): Promise<readonly Problem[]> {
  const located = await Promise.all(
    report.problems.map(async (p) => ({ ...p, fixable: (await checks.repairs(p)).length === 1 })),
  );
  return [...report.project.filter((p) => p.severity === 'error' || p.severity === 'warning'), ...located];
}

/** Whether a problem is in one of `under`: the file itself, or a folder that holds it. */
function inside(problem: Problem, under: readonly string[]): boolean {
  if (problem.file === undefined) return true;
  const file = problem.file;
  return under.some((path) => {
    const rel = relative(path, file);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  });
}

/** The one next step: nothing, `fudic_fix`, or the first error by its position. */
function nextOf(problems: readonly Problem[], root: string): string | null {
  const errors = problems.filter((p) => p.severity === 'error');
  if (errors.length === 0) return null;
  const fixable = errors.filter((p) => p.fixable === true).length;
  if (fixable > 0) return `Run fudic_fix for the ${fixable} fixable diagnostics, then run fudic_check again.`;
  const first = outDiagnostic(errors[0]!, root, read);
  const where = first.at === undefined ? '' : ` at ${first.at}`;
  return `Fix ${first.code}${where}, then run fudic_check again.`;
}

export async function checkProject(project: Project, checks: Checks, input: CheckInput): Promise<Answer> {
  if (!isFudicProject(project.root)) {
    return { body: {}, diagnostics: [FUD1404({ folder: project.root })], failed: true };
  }
  const under: string[] = [];
  for (const path of input.paths ?? []) {
    const located = locate(project.root, path);
    if ('error' in located) return { body: {}, diagnostics: [located.error], failed: true };
    under.push(located.path);
  }
  const all = await problemsOf(await checks.run(), checks);
  const listed = under.length === 0 ? all : all.filter((p) => inside(p, under));
  const files = new Set(all.flatMap((p) => (p.file === undefined ? [] : [p.file])));
  const summary = {
    errors: all.filter((p) => p.severity === 'error').length,
    warnings: all.filter((p) => p.severity === 'warning').length,
    fixable: all.filter((p) => p.fixable === true).length,
    files: files.size,
  };
  return { body: { summary }, diagnostics: listed.slice(0, input.limit), next: nextOf(all, project.root) };
}
