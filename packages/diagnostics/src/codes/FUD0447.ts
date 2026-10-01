import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0447`. */
export interface FUD0447Params {
  /** The adapter requested. */
  readonly target: string;
  /** The adapters installed. */
  readonly available: readonly string[];
}

/** `fudic new --target` names an adapter that is not available (SDD-22). */
export const FUD0447 = (p: FUD0447Params): ProjectDiagnostic =>
  project(
    'FUD0447',
    'error',
    `adapter '${p.target}' is not available; installed adapters: ${p.available.join(', ')}`,
  );
