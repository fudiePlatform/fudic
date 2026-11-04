import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD1408`. */
export interface FUD1408Params {
  /** What was being generated: `component` or `page`. */
  readonly kind: string;
}

/** `fudic_generate` of a component or a page without the `purpose` its history starts with (SDD-77). */
export const FUD1408 = (p: FUD1408Params): ProjectDiagnostic =>
  project('FUD1408', 'error', `a ${p.kind} is generated with its purpose: what the user asked for, in one sentence`);
