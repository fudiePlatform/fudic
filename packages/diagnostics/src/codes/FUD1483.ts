import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1483`. */
export type FUD1483Params = SourceInput & {
  readonly where: 'rule' | 'fails';
};

/** A `file` parameter of a `rule` or a `fails` (SDD-81). */
export const FUD1483 = (p: FUD1483Params): SourceDiagnostic =>
  source(
    'FUD1483',
    'error',
    `a ${p.where === 'rule' ? 'rule' : 'failure'} cannot take a file: its parameters are written in the .fudapi and travel in its message`,
    p,
  );
