import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1147`. */
export interface FUD1147Params extends SourceInput {
  /** The name of the rest binding. */
  readonly name: string;
}

/** A `...rest` binding of the view used as a whole value (SDD-61). */
export const FUD1147 = (p: FUD1147Params): SourceDiagnostic =>
  source('FUD1147', 'error', `\`${p.name}\` is a rest binding: read \`${p.name}.field\` or spread it on a tag`, p);
