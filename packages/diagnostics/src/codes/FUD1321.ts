import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1321`. */
export interface FUD1321Params extends SourceInput {
  /** The `later` field read. */
  readonly field: string;
}

/** A `later` field of `data` read outside an `@await` of that field (SDD-70). */
export const FUD1321 = (p: FUD1321Params): SourceDiagnostic =>
  source('FUD1321', 'error', `\`data.${p.field}\` arrives later: read it inside \`@await data.${p.field} { … }\``, p);
