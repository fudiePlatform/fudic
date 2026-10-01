import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0600`. */
export interface FUD0600Params extends SourceInput {
  /** The node the marker names, as written: `f`. */
  readonly node: string;
  /** What the node is bound as. */
  readonly kind: 'form' | 'group';
}

/** `error=` on a node bound as a form or a group (BUG-42). */
export const FUD0600 = (p: FUD0600Params): SourceDiagnostic =>
  source(
    'FUD0600',
    'error',
    `\`${p.node}\` is a ${p.kind}: its errors are a summary — write \`summary="@${p.node}"\``,
    p,
  );
