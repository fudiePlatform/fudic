import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0664`. */
export interface FUD0664Params extends SourceInput {
  /** The delegated name. */
  readonly name: string;
}

/** Two loops delegating the same name to one handler (SDD-37). */
export const FUD0664 = (p: FUD0664Params): SourceDiagnostic =>
  source(
    'FUD0664',
    'error',
    `\`${p.name}\` is already delegated to that handler by another loop: one name, one loop`,
    p,
  );
