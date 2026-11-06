import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1440`. */
export interface FUD1440Params extends SourceInput {
  /** The element the template writes. */
  readonly tag: string;
  /** The pieces of the guide that style it and the component does not adopt. */
  readonly pieces: readonly string[];
}

/** An element a piece of the guide styles, in a component that does not adopt the piece (SDD-79). */
export const FUD1440 = (p: FUD1440Params): SourceDiagnostic =>
  source(
    'FUD1440',
    'warning',
    `<${p.tag}> is styled by the guide's ${p.pieces.map((n) => `"${n}"`).join(', ')}, which this ` +
      'component does not adopt: add it to shadowrootadoptedstylesheets to look like the page',
    p,
  );
