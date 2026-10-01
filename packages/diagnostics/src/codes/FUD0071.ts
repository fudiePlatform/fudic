import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0071`. */
export interface FUD0071Params extends SourceInput {
  /** Which body the `{` should have opened: a block, or the body of a `@switch`. */
  readonly body: 'block' | 'switch';
}

/** A block body that does not start with `{` (SDD-06). */
export const FUD0071 = (p: FUD0071Params): SourceDiagnostic =>
  source(
    'FUD0071',
    'error',
    p.body === 'switch' ? "expected '{' to open the @switch body" : "expected '{' to open the block body",
    p,
  );
