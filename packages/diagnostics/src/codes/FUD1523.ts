import { source } from '../make.js';
import type { FudCode, SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1523`. */
export interface FUD1523Params extends SourceInput {
  /** The codes of the comment that silenced nothing. */
  readonly codes: readonly FudCode[];
  readonly scope: 'file' | 'next-line';
}

/** A `fud-disable` comment that silences nothing (SDD-83): what it was about has gone. */
export const FUD1523 = (p: FUD1523Params): SourceDiagnostic =>
  source(
    'FUD1523',
    'hint',
    `nothing to silence: ${p.codes.join(', ')} ${p.codes.length === 1 ? 'does' : 'do'} not occur ${p.scope === 'file' ? 'in this file' : 'on the next line'}`,
    p,
  );
