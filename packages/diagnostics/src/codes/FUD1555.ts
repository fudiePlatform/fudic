import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1555`. */
export interface FUD1555Params extends SourceInput {
  /** The sink as written: `innerHTML`, `insertAdjacentHTML`, `eval`. */
  readonly sink: string;
}

/** A string reaches a Trusted Types sink while the page requires trusted types (SDD-84). */
export const FUD1555 = (p: FUD1555Params): SourceDiagnostic =>
  source(
    'FUD1555',
    'warning',
    `the page requires Trusted Types: ${p.sink} with a string is blocked in the browser`,
    p,
  );
