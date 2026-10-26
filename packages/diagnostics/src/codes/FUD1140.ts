import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1140`. */
export interface FUD1140Params extends SourceInput {
  /** The callee, as written: `xs.find`, `formatea`, `total().toFixed`. */
  readonly callee: string;
}

/** A call in the view that is neither reading a reactive value nor a collection operation (SDD-61). */
export const FUD1140 = (p: FUD1140Params): SourceDiagnostic =>
  source(
    'FUD1140',
    'error',
    `\`${p.callee}(…)\` does not port: the view only reads values and uses \`filter\`, \`map\`, \`reduce\` and \`toSorted\``,
    p,
  );
