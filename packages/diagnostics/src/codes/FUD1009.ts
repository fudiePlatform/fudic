import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1009`. */
export type FUD1009Params = SourceInput & {
  /** The name both declare. */
  readonly name: string;
};

/** A server function and a `@client` or neutral variable with the same name (SDD-56). */
export const FUD1009 = (p: FUD1009Params): SourceDiagnostic =>
  source(
    'FUD1009',
    'error',
    `\`${p.name}\` is a server function, and in the browser that name already calls it: rename the other declaration`,
    p,
  );
