import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0053`. */
export interface FUD0053Params extends SourceInput {
  /** The void element's tag name. */
  readonly name: string;
}

/** A close tag written for a void element (SDD-05). */
export const FUD0053 = (p: FUD0053Params): SourceDiagnostic =>
  source('FUD0053', 'error', `void element <${p.name}> must not have a close tag`, p);
