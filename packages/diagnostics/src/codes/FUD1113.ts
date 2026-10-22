import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1113`. */
export type FUD1113Params = SourceInput & {
  readonly name: string;
  /** The other `.fudapi` that gives the name, or absent when it clashes with the `@code`. */
  readonly other?: string;
};

/** A name two linked `.fudapi` give, or one that clashes with a name of the `@code` (SDD-60). */
export const FUD1113 = (p: FUD1113Params): SourceDiagnostic =>
  source(
    'FUD1113',
    'error',
    p.other === undefined
      ? `"${p.name}" comes from a linked \`.fudapi\` and is declared again in the \`@code\``
      : `"${p.name}" is given by two linked \`.fudapi\`: this one and "${p.other}"`,
    p,
  );
