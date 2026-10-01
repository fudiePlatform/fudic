import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0052`. */
export interface FUD0052Params extends SourceInput {
  /** The tag name of the element left open. */
  readonly name: string;
}

/** An element that is never closed (SDD-05). */
export const FUD0052 = (p: FUD0052Params): SourceDiagnostic =>
  source('FUD0052', 'error', `unclosed <${p.name}> element`, p);
