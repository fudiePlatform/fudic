import { SPEC_EXTENSION } from '@fudic/spec';
import { hashFiles } from './hash.js';
import { InputGraph, TEST_EXTENSION } from './inputs.js';
import { type HistoryIo, nodeIo } from './io.js';
import { record } from './record.js';
import type { HistoryEvent } from './types.js';
import { pathOf, relativeTo } from './unit.js';

/** The input hashes of some units, by the unit's `.fud` relative to the project root. */
export interface Snapshot {
  readonly hashes: ReadonlyMap<string, string>;
}

/**
 * What the history reads of a criterion's report. The workbench's `CriterionReport` is one:
 * this package reads its reports and depends on none of them.
 */
export interface CriterionOutcome {
  /** The `.fudspec`, relative to the project root. */
  readonly spec: string;
  readonly id: string;
  readonly verdict: 'pass' | 'fail' | 'error';
}

/** What the history reads of a unit test run. `@fudic/testing`'s `TestReport` is one. */
export interface TestOutcome {
  /** Per test file, relative to the project root. */
  readonly files: readonly {
    readonly file: string;
    readonly pass: number;
    readonly fail: number;
    readonly broken: number;
  }[];
}

/** The input hashes of these units, taken before a run: what is about to be tested. */
export async function snapshot(units: readonly string[], io: HistoryIo = nodeIo()): Promise<Snapshot> {
  const graph = new InputGraph(io);
  const hashes = new Map<string, string>();
  for (const unit of units) hashes.set(relativeTo(io, pathOf(unit, io)), hashFiles(io, graph.filesOf(unit)));
  return { hashes };
}

/** Groups by unit, in first-seen order. */
function byUnit<T>(items: readonly T[], unitOf: (item: T) => string | undefined): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const unit = unitOf(item);
    if (unit !== undefined) groups.set(unit, [...(groups.get(unit) ?? []), item]);
  }
  return groups;
}

/** Writes one line per unit of the snapshot; a unit it did not take is not recorded: its hash is unknown. */
async function recordEach<T>(
  groups: Map<string, T[]>,
  before: Snapshot,
  io: HistoryIo,
  eventOf: (items: readonly T[], hash: string) => HistoryEvent,
): Promise<void> {
  for (const [unit, items] of groups) {
    const hash = before.hashes.get(unit);
    if (hash !== undefined) await record(unit, eventOf(items, hash), io);
  }
}

/** One `spec_run` line per .fudspec in the summary, with the hashes of the snapshot. */
export async function recordSpecRun(
  summary: { readonly reports: readonly CriterionOutcome[] },
  before: Snapshot,
  io: HistoryIo = nodeIo(),
): Promise<void> {
  const groups = byUnit(summary.reports, (report) => report.spec.replace(new RegExp(`\\${SPEC_EXTENSION}$`, 'u'), '.fud'));
  await recordEach(groups, before, io, (reports, hash) => {
    const verdicts = new Set(reports.map((report) => report.verdict));
    return {
      kind: 'spec_run',
      verdict: verdicts.has('error') ? 'error' : verdicts.has('fail') ? 'fail' : 'pass',
      passed: reports.filter((report) => report.verdict === 'pass').length,
      total: reports.length,
      hash,
      failing: reports.filter((report) => report.verdict !== 'pass').map((report) => report.id),
    };
  });
}

/** One `tests` line per unit whose sibling tests ran. */
export async function recordTestRun(report: TestOutcome, before: Snapshot, io: HistoryIo = nodeIo()): Promise<void> {
  // A test is a piece's when it is named after its `.fud`: `src/services/x.test.ts` names no piece
  // of the snapshot, and is left out with the rest of what the snapshot did not take.
  const groups = byUnit(report.files, (counts) =>
    counts.file.endsWith(TEST_EXTENSION) ? `${counts.file.slice(0, -TEST_EXTENSION.length)}.fud` : undefined,
  );
  await recordEach(groups, before, io, (files, hash) => {
    const sum = (key: 'pass' | 'fail' | 'broken'): number => files.reduce((total, counts) => total + counts[key], 0);
    const [passed, failed, broken] = [sum('pass'), sum('fail'), sum('broken')];
    return {
      kind: 'tests',
      verdict: broken > 0 ? 'broken' : failed > 0 ? 'red' : 'pass',
      passed,
      total: passed + failed + broken,
      hash,
    };
  });
}
