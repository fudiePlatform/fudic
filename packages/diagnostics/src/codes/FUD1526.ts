import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1526`. */
export interface FUD1526Params extends FileInput {
  /** The library's package name: `@acme/ui`. */
  readonly library: string;
  /** The web-features ids it uses that the app does not accept. */
  readonly features: readonly string[];
}

/** A library that uses features the app's Baseline does not accept: one per library (SDD-83). */
export const FUD1526 = (p: FUD1526Params): FileDiagnostic =>
  file(
    'FUD1526',
    'warning',
    `\`${p.library}\` uses features this app's Baseline does not accept: ${p.features.join(', ')}`,
    p,
  );
