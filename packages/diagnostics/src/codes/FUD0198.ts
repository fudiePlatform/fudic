import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0198`. */
export interface FUD0198Params extends SourceInput {
  /** The child component's tag. */
  readonly tag: string;
  /** The prop written, without the leading `.`. */
  readonly prop: string;
}

/** A `.prop` the child component does not declare (BUG-23). */
export const FUD0198 = (p: FUD0198Params): SourceDiagnostic =>
  source('FUD0198', 'error', `\`${p.tag}\` declares no property \`${p.prop}\``, p);
