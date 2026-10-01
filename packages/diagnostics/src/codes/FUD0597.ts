import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0597`. */
export interface FUD0597Params extends SourceInput {
  /** The node the marker names, as written: `f.title`. */
  readonly node: string;
}

/** An `error=`/`summary=` marker no element of its block binds with `control` (BUG-41). */
export const FUD0597 = (p: FUD0597Params): SourceDiagnostic =>
  source(
    'FUD0597',
    'error',
    `no element of this block binds \`${p.node}\` with \`control\`: a marker describes an element beside it — a native control, or a \`formassociated\` component`,
    p,
  );
