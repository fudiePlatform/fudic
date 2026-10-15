import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1021`. */
export type FUD1021Params = SourceInput & {
  /** What was used: `a pipe`, `t()`, `format()` or `locale`. */
  readonly what: string;
};

/** A pipe, `t()`, `format()` or `locale` in an app without `locales` (SDD-58). */
export const FUD1021 = (p: FUD1021Params): SourceDiagnostic =>
  source(
    'FUD1021',
    'error',
    `${p.what} needs a locale, and this app declares none: add "locales" to fudic.json`,
    p,
  );
