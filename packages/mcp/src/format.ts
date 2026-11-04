/**
 * `fudic_format`: the plan of `fudic fmt` over `paths` — the project without them —, its diff,
 * and the plan applied unless it is a dry run. The options are the CLI's own: the tool is the
 * command line, read by the same parser.
 */

import { relative } from 'node:path';
import { FUD1404 } from '@fudic/diagnostics';
import { located } from './check.js';
import type { Checks } from './checks.js';
import type { Problem } from './diagnostics.js';
import { isFudicProject, type Project } from './project.js';
import type { Answer } from './respond.js';

export interface FormatInput {
  readonly paths?: readonly string[];
  readonly dryRun: boolean;
}

function posix(path: string): string {
  return path.replace(/\\/gu, '/');
}

export async function formatProject(project: Project, checks: Checks, input: FormatInput): Promise<Answer> {
  if (!isFudicProject(project.root)) return { body: {}, diagnostics: [FUD1404({ folder: project.root })], failed: true };
  const asked = located(project.root, input.paths);
  if ('error' in asked) return { body: {}, diagnostics: [asked.error], failed: true };
  const paths = asked.under.map((path) => posix(relative(project.root, path)) || '.');

  const { cli } = await checks.fudic();
  // `fudic fmt` with no path formats the project, as here.
  const command = cli.parseArgs(['fmt', ...paths, '--cwd', project.root]);
  // The parser answers `fmt` for `fmt` and paths, which is all this builds; the narrow is for the type.
  /* v8 ignore next */
  if (command.kind !== 'fmt') throw new Error(`fudic fmt did not parse: ${command.kind}`);
  const plan = await cli.planFmt(command.paths, command.opts);

  const problems: Problem[] = [
    ...plan.errors.map((e): Problem => (e.file === undefined ? e : { ...e, file: `${project.root}/${e.file}` })),
    ...plan.diagnostics.map((d): Problem => ({ ...d.diagnostic, file: `${project.root}/${d.file}` })),
  ];
  const diff = plan.changes.flatMap((change) => cli.formatDiff(change)).join('\n');
  // As `fudic fmt` does: a plan with a file that does not parse is not applied at all.
  const written = !input.dryRun && plan.errors.length === 0 && plan.changes.length > 0;
  if (written) await cli.apply(plan, command.opts);
  return {
    body: { formatted: plan.changes.map((change) => change.path), written, diff },
    diagnostics: problems,
    next: plan.errors.length > 0 ? 'Fix the files that do not parse; nothing was formatted.' : null,
  };
}
