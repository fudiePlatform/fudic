/**
 * `fudic_test` and `fudic_spec_run`: the project's tests and criteria, run in this process by the
 * runners it installed, and written into the history of each piece — what its phases are read
 * from. Only what does not pass is detailed. One run at a time: a second call waits.
 */

import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { within } from './locate.js';
import { FUD1207, FUD1404, FUD1405, type FilePosition, type FudDiagnostic, type WireDiagnostic } from '@fudic/diagnostics';
import { nodeIo, recordSpecRun, recordTestRun, snapshot } from '@fudic/history';
import { toPosix } from '@fudic/typecheck';
import type { Checks } from './checks.js';
import { located } from './check.js';
import { loadRunners, type Runners } from './fudic.js';
import { showcaseCurrent, unitsOf, type Unit } from './phases.js';
import { isFudicProject, type Project } from './project.js';
import type { Answer } from './respond.js';

function posix(path: string): string {
  return path.replace(/\\/gu, '/');
}

/** `file:line:column`, as every answer writes a place. */
function at(position: FilePosition): string {
  return `${posix(position.file)}:${position.line}:${position.column}`;
}

/** Whether a file is the project's own: inside it, and not in what was installed into it. */
function ours(root: string, file: string): boolean {
  const path = resolve(root, file);
  return within(root, path) && !posix(relative(root, path)).split('/').includes('node_modules');
}

/** A diagnostic of a run in the shape of §3.4. */
function wire(d: WireDiagnostic): Readonly<Record<string, unknown>> {
  const place = d.file === null ? undefined : d.line === null ? posix(d.file) : `${posix(d.file)}:${d.line}:${d.column ?? 1}`;
  return { code: d.code, severity: d.severity, message: d.message, ...(place !== undefined ? { at: place } : {}) };
}

/** One run after another: the browser and vitest are not shared between two. */
export class RunQueue {
  #last: Promise<unknown> = Promise.resolve();

  run<T>(job: () => Promise<T>): Promise<T> {
    const next = this.#last.then(job, job);
    this.#last = next.catch(() => undefined);
    return next;
  }
}

export interface RunsDeps {
  readonly runners: (root: string) => Promise<Runners>;
}

const nodeRunsDeps: RunsDeps = { runners: (root) => loadRunners(root) };

/** The pieces of the project and their phases, after a run wrote its lines. */
async function phases(project: Project, checks: Checks): Promise<readonly Unit[]> {
  const { cli } = await checks.fudic();
  return unitsOf(project.root, await checks.service(), { showcase: await showcaseCurrent(project.root, cli) });
}

/** The pieces a narrowed run was asked about: the next step is about what just ran, and only that. */
function ranFirst(units: readonly Unit[], root: string, ran: readonly string[]): readonly Unit[] {
  if (ran.length === 0) return units;
  // In one form, `toPosix`: the project service names a file with its drive in lower case.
  return units.filter((unit) => {
    const piece = toPosix(resolve(root, unit.piece));
    const stem = piece.slice(0, -'.fud'.length);
    return ran.map((path) => toPosix(resolve(path))).some((path) => piece.startsWith(`${path}/`) || path.startsWith(stem));
  });
}

/** What to do after a test run, by the phase the pieces are in. */
function nextAfterTests(units: readonly Unit[], broken: number): string | null {
  if (broken > 0) return 'Every test must fail for the right reason: a broken test is not red. Fix what broke it — the diagnostics say what — and run fudic_test again.';
  const unit = units.find((u) => u.phase === 'red' || u.phase === 'view');
  if (unit === undefined) return null;
  if (unit.phase === 'red') return `Every test of ${unit.piece} must fail for the right reason: an assertion that says no, not one that breaks. Then run fudic_spec_run.`;
  return `Make the view of ${unit.piece} pass these tests. Do not change the tests.`;
}

export interface TestInput {
  readonly paths?: readonly string[];
  readonly names?: readonly string[];
  readonly failing: boolean;
}

export async function runTestsTool(project: Project, checks: Checks, queue: RunQueue, input: TestInput, deps: RunsDeps = nodeRunsDeps): Promise<Answer> {
  const { root } = project;
  if (!isFudicProject(root)) return { body: {}, diagnostics: [FUD1404({ folder: root })], failed: true };
  const asked = located(root, input.paths);
  if ('error' in asked) return { body: {}, diagnostics: [asked.error], failed: true };
  const { runTests } = await deps.runners(root);
  if (runTests === undefined) {
    return { body: {}, diagnostics: [FUD1207({ reason: '@fudic/testing is not installed in the project: pnpm add -D @fudic/testing' })], failed: true };
  }
  return queue.run(async () => {
    const io = nodeIo(root);
    const service = await checks.service();
    const before = await snapshot(service.pieces().map((p) => p.file), io);
    const report = await runTests({
      root,
      ...(asked.under.length > 0 ? { paths: asked.under } : {}),
      ...(input.names !== undefined ? { names: input.names } : {}),
      failing: input.failing,
    });
    await recordTestRun(report, before, io);
    const tests = report.tests.map((t) =>
      t.verdict === 'fail'
        ? { verdict: 'fail', file: posix(t.file), name: t.name, at: at(t.at), quote: t.quote, message: t.message, ...(t.expected !== undefined ? { expected: t.expected } : {}), ...(t.actual !== undefined ? { got: t.actual } : {}) }
        : { verdict: 'broken', file: posix(t.file), name: t.name, ...(t.at !== undefined ? { at: at(t.at), quote: t.quote } : {}), diagnostics: t.diagnostics.map(wire) },
    );
    return {
      body: { summary: report.summary, tests, ms: report.ms },
      next: nextAfterTests(ranFirst(await phases(project, checks), root, asked.under), report.summary.broken),
    };
  });
}

export interface SpecInput {
  /** A tag, a route, or a path; none = every piece. */
  readonly spec?: string;
  readonly criteria?: readonly string[];
  readonly failing: boolean;
}

/** The `.fudspec` a tag, a route or a path names; undefined when it names none. */
async function specOf(project: Project, checks: Checks, spec: string): Promise<string | undefined> {
  const piece = (await checks.service()).pieces().find((p) => p.name === spec);
  if (piece !== undefined) return `${piece.file.slice(0, -'.fud'.length)}.fudspec`;
  const asked = located(project.root, [spec]);
  if ('error' in asked) return undefined;
  const path = asked.under[0]!;
  return existsSync(path) ? path : undefined;
}

export async function runSpecsTool(project: Project, checks: Checks, queue: RunQueue, input: SpecInput, deps: RunsDeps = nodeRunsDeps): Promise<Answer> {
  const { root } = project;
  if (!isFudicProject(root)) return { body: {}, diagnostics: [FUD1404({ folder: root })], failed: true };
  let paths: string[] = [];
  if (input.spec !== undefined) {
    const found = await specOf(project, checks, input.spec);
    if (found === undefined) return { body: { spec: input.spec }, diagnostics: [FUD1405({ name: input.spec })], failed: true };
    paths = [found];
  }
  const { runSpecs } = await deps.runners(root);
  if (runSpecs === undefined) {
    return { body: {}, diagnostics: [FUD1207({ reason: '@fudic/workbench is not installed in the project: pnpm add -D @fudic/workbench' })], failed: true };
  }
  return queue.run(async () => {
    const io = nodeIo(root);
    const service = await checks.service();
    const before = await snapshot(service.pieces().map((p) => p.file), io);
    // What is not about a criterion: a path that is no component, a component with no `.fudspec`.
    const problems: FudDiagnostic[] = [];
    const summary = await runSpecs(paths, {
      root,
      failing: input.failing,
      ...(input.criteria !== undefined ? { criteria: input.criteria } : {}),
      onDiagnostic: (d) => problems.push(d),
    });
    // Nothing ran: no browser, no `.fudspec` where it was asked. The codes of SDD-64 say which.
    if ('diagnostic' in summary) return { body: {}, diagnostics: [summary.diagnostic], failed: true };
    await recordSpecRun(summary, before, io);
    const criteria = summary.reports
      .filter((r) => r.verdict !== 'pass')
      .map((r) => ({
        spec: posix(r.spec),
        id: r.id,
        verdict: r.verdict,
        at: at(r.at),
        ...(r.failed !== undefined ? { step: r.failed.step, stepAt: at(r.failed.at), expected: r.failed.expected, got: r.failed.actual } : {}),
        ...(r.broken !== undefined
          ? { ...(r.broken.step !== undefined ? { step: r.broken.step } : {}), diagnostics: r.broken.diagnostics.map(wire) }
          : {}),
        // A step that located the host itself points at the page the bench mounted it in, under
        // node_modules or outside the project: nothing the chat can open or change.
        ...(r.source !== undefined && ours(root, r.source.at.file) ? { source: at(r.source.at), quote: r.source.quote } : {}),
        ...(r.shots?.after !== undefined ? { shot: posix(r.shots.after) } : r.shots?.before !== undefined ? { shot: posix(r.shots.before) } : {}),
        ...(r.pageErrors.length > 0 ? { pageErrors: r.pageErrors } : {}),
      }));
    const units = ranFirst(await phases(project, checks), root, paths);
    const red = units.find((u) => u.phase === 'red' || u.phase === 'view');
    return {
      body: { summary: { pass: summary.pass, fail: summary.fail, error: summary.error }, browser: summary.browser, criteria, ms: summary.ms },
      diagnostics: problems,
      next:
        summary.error > 0
          ? 'A criterion that errors did not say pass or fail: fix what its diagnostics say, then run fudic_spec_run again.'
          : red === undefined
            ? null
            : red.phase === 'red'
              ? `Every criterion of ${red.piece} must fail for the right reason. Then write its view.`
              : `Make the view of ${red.piece} pass these criteria. Do not change the .fudspec.`,
    };
  });
}
