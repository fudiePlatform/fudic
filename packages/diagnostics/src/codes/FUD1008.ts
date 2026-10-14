import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1008`. */
export type FUD1008Params = SourceInput & {
  /** The variable read. */
  readonly name: string;
};

/** A component's server function reading a `@server` variable that is not an import (SDD-56). */
export const FUD1008 = (p: FUD1008Params): SourceDiagnostic =>
  source(
    'FUD1008',
    'error',
    `a component's server function has no instance, so it cannot read \`${p.name}\`: only imports and other server functions of the \`@server\``,
    p,
  );
