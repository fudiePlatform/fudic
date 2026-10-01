import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0051`. */
export interface FUD0051Params extends SourceInput {
  /** The tag name of the close tag. */
  readonly name: string;
}

/** A close tag that matches no open element (SDD-05). */
export const FUD0051 = (p: FUD0051Params): SourceDiagnostic =>
  source('FUD0051', 'error', `close tag </${p.name}> matches no open element`, p);
