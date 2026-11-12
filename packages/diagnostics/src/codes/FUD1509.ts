import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1509`. */
export interface FUD1509Params extends SourceInput {
  /** What is missing: `a step beside \`>\``, `the text after \`~\``. */
  readonly missing: string;
}

/** A reference that does not parse: an empty step or an empty `~` (`.fudspec`) (SDD-82). */
export const FUD1509 = (p: FUD1509Params): SourceDiagnostic =>
  source('FUD1509', 'error', `the reference is missing ${p.missing}: \`role:row/~"Ana">role:button/"Delete"\``, p);
