import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1522`. */
export interface FUD1522Params extends SourceInput {
  /** What is missing or wrong: no code, no reason, or a shape that is not the directive's. */
  readonly reason: string;
}

/** A `fud-disable` comment without its codes or its reason (SDD-83): it silences nothing. */
export const FUD1522 = (p: FUD1522Params): SourceDiagnostic =>
  source(
    'FUD1522',
    'error',
    `this fud-disable comment silences nothing: ${p.reason}. Write it as \`fud-disable-next-line FUD1380: why\``,
    p,
  );
