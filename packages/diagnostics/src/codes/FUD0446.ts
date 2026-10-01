import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0446`. */
export interface FUD0446Params {
  /** The section requested. */
  readonly name: string;
  /** The sections the layout does declare. */
  readonly available: readonly string[];
}

/** `fudic g page --sections` names a section the layout does not render (SDD-22). */
export const FUD0446 = (p: FUD0446Params): ProjectDiagnostic =>
  project(
    'FUD0446',
    'error',
    `the layout declares no @RenderSection(${p.name})${p.available.length > 0 ? `; it declares: ${p.available.join(', ')}` : ''}`,
  );
