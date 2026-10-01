import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0197`. */
export interface FUD0197Params extends SourceInput {
  /** The child component's tag. */
  readonly tag: string;
  /** The required props nobody passed, without the leading `.`, in declaration order. */
  readonly missing: readonly string[];
}

/** A required prop of a child component that its host does not pass (BUG-23). */
export const FUD0197 = (p: FUD0197Params): SourceDiagnostic =>
  source(
    'FUD0197',
    'error',
    `\`${p.tag}\` requires ${p.missing.map((name) => `\`.${name}\``).join(', ')}`,
    p,
  );
