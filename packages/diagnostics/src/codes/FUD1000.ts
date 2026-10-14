import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1000`. */
export type FUD1000Params = SourceInput & {
  /** What could not be read, as a phrase: `the argument of \`.use\``. */
  readonly what: string;
};

/** A server function's or `http`'s chain that cannot be read at compile time (SDD-56). */
export const FUD1000 = (p: FUD1000Params): SourceDiagnostic =>
  source(
    'FUD1000',
    'error',
    `the chain is read at compile time, and ${p.what} cannot be: write identifiers in \`.use\`/\`.skip\`, string literals in \`.invalidates\`, and \`false\` or an object literal in \`.compress\``,
    p,
  );
