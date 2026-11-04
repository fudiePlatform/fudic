import type { SourceDiagnostic } from '@fudic/diagnostics';
import { approvalHash } from './hash.js';
import { inputsHash } from './inputs.js';
import { type HistoryIo, nodeIo } from './io.js';
import { parseHistory } from './parse.js';
import { historyOf } from './record.js';
import type { HistoryEvent, HistoryLine } from './types.js';
import { pathOf, relativeTo } from './unit.js';

/** What the history says of the last run of one kind, against the files as they are now. */
export type RunState =
  | { readonly state: 'not run' }
  /** The files changed since; `last` is the verdict it had. */
  | { readonly state: 'stale'; readonly last: string }
  | { readonly state: 'pass' | 'red' | 'broken' | 'fail' | 'error'; readonly passed: number; readonly total: number };

/** What the history and the files say about a unit, now. */
export interface UnitState {
  /** The `.fud`, relative to the project root. */
  readonly unit: string;
  readonly lines: readonly HistoryLine[];
  readonly diagnostics: readonly SourceDiagnostic[];
  readonly approval: 'none' | 'valid' | 'expired';
  /** The commit of the last `approved`. */
  readonly approvedAt?: string;
  readonly tests: RunState;
  readonly spec: RunState;
  readonly look: 'none' | 'valid' | 'expired';
  /** The last of done/reopened is done. */
  readonly done: boolean;
  readonly accepted?: { readonly tag: string; readonly commit: string };
}

type Of<K extends HistoryEvent['kind']> = HistoryLine & { readonly event: Extract<HistoryEvent, { kind: K }> };

const lastOf = <K extends HistoryEvent['kind']>(lines: readonly HistoryLine[], ...kinds: readonly K[]): Of<K> | undefined =>
  lines.findLast((line): line is Of<K> => (kinds as readonly string[]).includes(line.event.kind));

function runState(line: Of<'tests' | 'spec_run'> | undefined, hash: string): RunState {
  if (line === undefined) return { state: 'not run' };
  const { verdict, passed, total } = line.event;
  return line.event.hash === hash ? { state: verdict, passed, total } : { state: 'stale', last: verdict };
}

/** A signature over a hash: none, still the hash of now, or no longer. */
function signature(line: { readonly event: { readonly hash: string } } | undefined, now: string | undefined): 'none' | 'valid' | 'expired' {
  if (line === undefined) return 'none';
  return now === undefined || line.event.hash === now ? 'valid' : 'expired';
}

/** What the history and the files say about a unit, now. */
export async function unitState(unit: string, io: HistoryIo = nodeIo()): Promise<UnitState> {
  const path = pathOf(unit, io);
  const file = historyOf(path);
  const { value: lines, diagnostics } = parseHistory(io.fs.readFile(file) ?? '', file);

  // An approval or a look is of the piece since it last started over.
  const reopened = lines.findLastIndex((line) => line.event.kind === 'reopened');
  const current = lines.slice(reopened + 1);
  const approved = lastOf(current, 'approved');
  const look = lastOf(current, 'look');
  const inputs = await inputsHash(path, io);
  const accepted = lastOf(lines, 'accepted');

  return {
    unit: relativeTo(io, path),
    lines,
    diagnostics,
    approval: signature(approved, await approvalHash(path, io)),
    ...(approved === undefined ? {} : { approvedAt: approved.commit }),
    tests: runState(lastOf(lines, 'tests'), inputs),
    spec: runState(lastOf(lines, 'spec_run'), inputs),
    look: signature(look, io.lookHash === undefined ? undefined : await io.lookHash(path)),
    done: lastOf(lines, 'done', 'reopened')?.event.kind === 'done',
    ...(accepted === undefined ? {} : { accepted: { tag: accepted.event.tag, commit: accepted.commit } }),
  };
}
