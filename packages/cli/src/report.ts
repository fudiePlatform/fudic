/**
 * Output (SDD-22 §4.7). It distinguishes CREATE from MODIFY because the risk is not the
 * same, and under `--dry-run` a modification is shown as a diff: that is the only way a
 * user can review a change over a file of theirs before accepting it.
 *
 * Messages are in English, like every string in this repo; only the spec is in Spanish.
 */

import { LineMap } from '@fudic/compiler';
import type { CliError, FileChange, Plan, PlanDiagnostic } from './types.js';

export function formatChange(change: FileChange): string {
  return change.kind === 'create' ? `  create  ${change.path}` : `  modify  ${change.path}`;
}

export function formatPlan(plan: Plan): readonly string[] {
  return [
    ...plan.changes.map(formatChange),
    ...plan.commands.map((c) => `  run     ${[c.command, ...c.args].join(' ')} (in ${c.dir})`),
  ];
}

/** A minimal line diff. Only insertions and whole-file rewrites ever reach it. */
export function formatDiff(change: FileChange): readonly string[] {
  if (change.kind === 'create') return [];
  const before = change.before.split('\n');
  const after = change.contents.split('\n');

  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head += 1;
  let tail = 0;
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail += 1;
  }

  const removed = before.slice(head, before.length - tail);
  const added = after.slice(head, after.length - tail);
  return [
    `--- ${change.path}`,
    `+++ ${change.path}`,
    `@@ line ${head + 1} @@`,
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
  ];
}

/**
 * A compiler diagnostic, with its span turned into line:column for a terminal. `source`
 * is the text the span refers to; without it the offsets are printed raw, which is still
 * a span — the invariant is that a diagnostic never loses its location.
 */
export function formatDiagnostic(entry: PlanDiagnostic, source?: string): string {
  const { file, diagnostic } = entry;
  const where =
    source === undefined
      ? `${file}@${diagnostic.span.start}-${diagnostic.span.end}`
      : (() => {
          const p = new LineMap(source).positionAt(diagnostic.span.start);
          return `${file}:${p.line + 1}:${p.character + 1}`;
        })();
  return `${where} ${diagnostic.severity} ${diagnostic.code} ${diagnostic.message}`;
}

export function formatError(error: CliError): string {
  return `error ${error.code} ${error.message}`;
}

/** The `--json` payload: the plan, verbatim, with no human text mixed in. */
export function planToJson(plan: Plan): string {
  return JSON.stringify(
    {
      changes: plan.changes.map((change) => ({ kind: change.kind, path: change.path, contents: change.contents })),
      commands: plan.commands,
      diagnostics: plan.diagnostics,
      errors: plan.errors,
    },
    null,
    2,
  );
}
