import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1022`. */
export type FUD1022Params = SourceInput & {
  /** The locale the translation is missing from. */
  readonly locale: string;
};

/** A message without a translation to one locale (SDD-58). */
export const FUD1022 = (p: FUD1022Params): SourceDiagnostic =>
  source('FUD1022', 'warning', `this message has no translation to "${p.locale}": the page shows the original text`, p);
