import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0072`. */
export interface FUD0072Params extends SourceInput {
  /** Which body was left open: a block, or the body of a `@switch`. */
  readonly body: 'block' | 'switch';
}

/** A block body whose closing `}` never arrives (SDD-06). */
export const FUD0072 = (p: FUD0072Params): SourceDiagnostic =>
  source(
    'FUD0072',
    'error',
    p.body === 'switch' ? "unclosed @switch body: expected '}'" : "unclosed block: expected '}'",
    p,
  );
