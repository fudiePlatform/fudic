import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1503`. */
export interface FUD1503Params extends SourceInput {
  readonly url: string;
  /** The page's pattern: `/blog/:slug`. */
  readonly pattern: string;
}

/** `url` in a page spec with a URL another route answers (`.fudspec`) (SDD-82). */
export const FUD1503 = (p: FUD1503Params): SourceDiagnostic =>
  source('FUD1503', 'error', `${p.url} is not a URL of this page: its pattern is ${p.pattern}`, p);
