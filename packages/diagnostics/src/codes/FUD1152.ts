import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1152`. */
export interface FUD1152Params extends SourceInput {
  /** The operator the operand belongs to, as written: `<`, `+`, `===`. */
  readonly operator: string;
}

/** An operand whose type the operator does not port for (SDD-61). */
export const FUD1152 = (p: FUD1152Params): SourceDiagnostic =>
  source('FUD1152', 'error', `\`${p.operator}\` does not port for this type: convert the value in \`load()\``, p);
