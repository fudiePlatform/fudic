import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0933`. */
export interface FUD0933Params extends SourceInput {
  /** The slug of the criterion. */
  readonly slug: string;
}

/** A criterion that does not end in a `then` block (`.fudspec`) (SDD-52, SDD-82). */
export const FUD0933 = (p: FUD0933Params): SourceDiagnostic =>
  source('FUD0933', 'error', `criterion \`${p.slug}\` does not end in \`then\`: what it does last is never checked`, p);
