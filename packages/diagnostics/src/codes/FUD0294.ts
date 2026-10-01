import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0294`. */
export interface FUD0294Params extends SourceInput {
  /** The attribute name as written (a `.prop` keeps its `.`). */
  readonly name: string;
}

/** An author-written attribute in the compiler's reserved `data-fud-*` namespace (SDD-15). */
export const FUD0294 = (p: FUD0294Params): SourceDiagnostic =>
  source(
    'FUD0294',
    'error',
    `\`${p.name}\` is reserved: the \`data-fud-\` namespace belongs to the compiler. Use a \`data-\` name of your own.`,
    p,
  );
