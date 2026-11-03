/**
 * The report of one criterion: what a machine reads to fix it without guessing. Where the
 * criterion and its failed step are, what was expected and what came out, as text. Pure: it is
 * built from the session and the result the engine already has.
 */

import { posix } from 'node:path';
import { LineMap, type FilePosition } from '@fudic/diagnostics';
import type { CriterionResult } from './engine.js';
import type { PlannedCriterion, PlannedStep } from './pages.js';
import { toWire, type StepPassed, type StepResult, type Verdict, type WireDiagnostic } from './protocol.js';

export interface FailedStep {
  /** The step as written: `"then  emitted press 0"`. */
  readonly step: string;
  /** Its line in the `.fudspec`. */
  readonly at: FilePosition;
  readonly expected: string;
  readonly actual: string;
}

export interface BrokenRun {
  /** The step that threw, as written. */
  readonly step?: string;
  /** Its line, or the criterion's when nothing ran. */
  readonly at?: FilePosition;
  /** At least one, each with its code. */
  readonly diagnostics: readonly WireDiagnostic[];
}

export interface SourceRef {
  /** The element's opening tag in its `.fud`. */
  readonly at: FilePosition;
  /** That source line, trimmed. */
  readonly quote: string;
}

export interface CriterionReport {
  /** The `.fudspec`, relative to the project root. */
  readonly spec: string;
  /** The criterion's slug. */
  readonly id: string;
  /** The `criterion` line. */
  readonly at: FilePosition;
  readonly verdict: Verdict;
  readonly ms: number;
  /** The first `then` that answered false. Only when the verdict is `fail`. */
  readonly failed?: FailedStep;
  /** Why it could not run, or the step that threw. Only when the verdict is `error`. */
  readonly broken?: BrokenRun;
  /** The element the failed or broken step located, back in its `.fud`. */
  readonly source?: SourceRef;
  /** Screenshots on disk, relative to the project root. Only when the verdict is not `pass`. */
  readonly shots?: { readonly before?: string; readonly after?: string };
  readonly pageErrors: readonly string[];
}

/** What the report reads of a session: its `.fudspec` and what each step's term says it checks. */
export interface ReportSource {
  /** The project root, absolute, with '/'. */
  readonly root: string;
  /** The `.fudspec`, absolute; the component when it has none. */
  readonly spec: string;
  /** Its text; empty without one. */
  readonly text: string;
  /** By criterion id, each step's `describe`: null when its term has none. */
  readonly expectations: ReadonlyMap<string, readonly (string | null)[]>;
}

export interface ReportSession {
  readonly criteria: readonly PlannedCriterion[];
  readonly source: ReportSource;
}

/** The shots the run wrote to disk, relative to the project root. */
export type ShotPaths = NonNullable<CriterionReport['shots']>;

/** The `actual` of a term that answered nothing. */
const NOTHING = '—';

export function reportOf(session: ReportSession, result: CriterionResult, shots: ShotPaths = {}): CriterionReport {
  const { source } = session;
  const spec = posix.relative(source.root, source.spec);
  const lines = new LineMap(source.text);
  const at = (offset: number): FilePosition => {
    const position = lines.positionAt(offset);
    return { file: spec, line: position.line + 1, column: position.character + 1 };
  };
  const criterion = session.criteria.find((c) => c.id === result.id);
  // A step is one line: from its term to the end of that line.
  const written = (step: PlannedStep): string => `${step.block}  ${source.text.slice(step.offset).split(/\r?\n/u, 1)[0]!.trimEnd()}`;

  const where = at(criterion?.offset ?? 0);
  const failed = result.verdict === 'fail' && criterion !== undefined ? failedStep() : undefined;
  const broken = result.verdict === 'error' ? brokenRun() : undefined;
  return {
    spec,
    id: result.id,
    at: where,
    verdict: result.verdict,
    ms: result.ms,
    ...(failed !== undefined ? { failed } : {}),
    ...(broken !== undefined ? { broken } : {}),
    ...(result.verdict !== 'pass' && (shots.before !== undefined || shots.after !== undefined) ? { shots } : {}),
    pageErrors: result.pageErrors,
  };

  function failedStep(): FailedStep | undefined {
    const index = result.steps.findIndex(isRed);
    const step = result.steps[index];
    const planned = criterion!.steps[index];
    if (step === undefined || !isRed(step) || planned === undefined) return undefined;
    const describe = source.expectations.get(result.id)?.[index] ?? null;
    return { step: written(planned), at: at(planned.offset), ...evidenceOf(step.evidence, describe ?? written(planned)) };
  }

  /** The step that threw, when one did, and every problem of the run, located for a reader. */
  function brokenRun(): BrokenRun {
    const planned = criterion?.steps[result.steps.findIndex((step) => 'error' in step)];
    const read = (file: string) => (file === source.spec ? source.text : undefined);
    const diagnostics = result.diagnostics.map((diagnostic) => {
      const wire = toWire(diagnostic, null, read);
      return wire.file === null ? wire : { ...wire, file: posix.relative(source.root, wire.file) };
    });
    return planned === undefined
      ? { at: where, diagnostics }
      : { step: written(planned), at: at(planned.offset), diagnostics };
  }
}

/** A `then` that answered false. */
function isRed(step: StepResult): step is StepPassed {
  return step.block === 'then' && 'pass' in step && !step.pass;
}

/**
 * A term's evidence as text. A stock `then` already answers `{ expected, actual }` in words; a
 * term of the project may answer a sentence or nothing, and then what it checks is its
 * `describe`, or the step as written.
 */
export function evidenceOf(value: unknown, expected: string): { expected: string; actual: string } {
  if (typeof value === 'object' && value !== null && 'expected' in value && 'actual' in value) {
    return { expected: textOf(value.expected), actual: textOf(value.actual) };
  }
  return { expected, actual: value === null || value === undefined ? NOTHING : textOf(value) };
}

function textOf(value: unknown): string {
  // `JSON.stringify` answers undefined for undefined and for a function.
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
}
