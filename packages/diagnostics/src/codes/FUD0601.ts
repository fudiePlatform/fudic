import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0601`. */
export interface FUD0601Params extends SourceInput {
  /** The node the marker names, as written: `f.title`. */
  readonly node: string;
}

/** `summary=` on a node bound as a single control (BUG-42). */
export const FUD0601 = (p: FUD0601Params): SourceDiagnostic =>
  source(
    'FUD0601',
    'error',
    `\`${p.node}\` is a control: its message is not a summary — write \`error="@${p.node}"\``,
    p,
  );
