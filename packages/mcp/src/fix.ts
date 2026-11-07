/**
 * `fudic_fix`: the repairs the editor would apply without asking — a diagnostic with exactly
 * one —, applied and checked again, at most five rounds, until none is left. What has several
 * repairs is the caller's to choose, and goes back with its options.
 */

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { FUD1404 } from '@fudic/diagnostics';
import type { RepairEdit } from '@fudic/language-server/project';
import type { CheckProblem } from '@fudic/typecheck';
import { inside, located, nextOf, problemsOf, summaryOf } from './check.js';
import type { Checks } from './checks.js';
import { outDiagnostic } from './diagnostics.js';
import { isFudicProject, type Project } from './project.js';
import { read, type Answer } from './respond.js';

/** As many rounds as a repair that uncovers another can need, and no more. */
export const ROUNDS = 5;

export interface FixInput {
  readonly paths?: readonly string[];
  readonly codes?: readonly string[];
  readonly dryRun: boolean;
}

interface Applied {
  readonly code: string;
  readonly at: string | undefined;
  readonly title: string;
}

function posix(path: string): string {
  return path.replace(/\\/gu, '/');
}

/** Whether two edits of one file touch the same text: only one of them is applied in a round. */
function overlaps(a: RepairEdit, b: RepairEdit): boolean {
  return posix(a.path) === posix(b.path) && a.span.start <= b.span.end && b.span.start <= a.span.end;
}

/** A file's text with its edits, from the last to the first so the offsets hold. */
function edited(text: string, edits: readonly RepairEdit[]): string {
  return [...edits]
    .sort((a, b) => b.span.start - a.span.start)
    .reduce((out, edit) => out.slice(0, edit.span.start) + edit.newText + out.slice(edit.span.end), text);
}

function readText(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return ''; // a repair that creates the file starts from nothing
  }
}

export async function fixProject(project: Project, checks: Checks, input: FixInput): Promise<Answer> {
  if (!isFudicProject(project.root)) return { body: {}, diagnostics: [FUD1404({ folder: project.root })], failed: true };
  const asked = located(project.root, input.paths);
  if ('error' in asked) return { body: {}, diagnostics: [asked.error], failed: true };
  const { under } = asked;
  const wanted = (p: CheckProblem): boolean => (input.codes === undefined || input.codes.includes(p.code)) && inside(p, under);

  const { cli } = await checks.fudic();
  const applied: Applied[] = [];
  /** Each touched file as it was before the first round, for the diff. */
  const before = new Map<string, string>();
  /** In a dry run, what each file would be: nothing is written. */
  const after = new Map<string, string>();

  for (let round = 0; round < ROUNDS; round++) {
    const report = await checks.run();
    const chosen: { readonly problem: CheckProblem; readonly title: string; readonly edits: readonly RepairEdit[] }[] = [];
    for (const problem of report.problems.filter(wanted)) {
      const repairs = await checks.repairs(problem);
      if (repairs.length !== 1) continue;
      const [repair] = repairs as [(typeof repairs)[number]];
      // A repair only the author may apply — one that removes what a script may still need.
      if (repair.manual === true) continue;
      if (chosen.some((c) => c.edits.some((e) => repair.edits.some((f) => overlaps(e, f))))) continue;
      chosen.push({ problem, title: repair.title, edits: repair.edits });
    }
    if (chosen.length === 0) break;

    const byFile = new Map<string, RepairEdit[]>();
    for (const edit of chosen.flatMap((c) => c.edits)) byFile.set(edit.path, [...(byFile.get(edit.path) ?? []), edit]);
    const changes = [...byFile].map(([path, edits]) => {
      const current = after.get(path) ?? readText(path);
      if (!before.has(path)) before.set(path, current);
      return { path, contents: edited(current, edits), before: current };
    });
    for (const c of chosen) {
      applied.push({ code: c.problem.code, at: outDiagnostic(c.problem, project.root, read).at, title: c.title });
    }
    if (input.dryRun) {
      for (const change of changes) after.set(change.path, change.contents);
      // Without writing, the check cannot see the next round: one round is what a dry run shows.
      break;
    }
    await cli.apply(
      { changes: changes.map((c) => ({ kind: 'modify', ...c })), commands: [], diagnostics: [], errors: [] },
      { cwd: project.root, force: false },
    );
  }

  const diff = [...before].flatMap(([path, was]) =>
    cli.formatDiff({ kind: 'modify', path: posix(relative(project.root, path)), contents: after.get(path) ?? readText(path), before: was }),
  );
  // What is left, in the shape of `fudic_check`: what has several repairs carries its options.
  const all = await problemsOf(await checks.run(), checks);
  return {
    body: { applied, diff: diff.join('\n'), summary: summaryOf(all) },
    diagnostics: all.filter((p) => inside(p, under)),
    next: nextOf(all, project.root),
  };
}
