import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1550`. */
export interface FUD1550Params extends FileInput {
  /** `max-age`: below one year. `subdomains`: without `includeSubDomains`. */
  readonly problem: 'max-age' | 'subdomains';
}

/** HSTS `preload` without what the preload list requires (SDD-84). */
export const FUD1550 = (p: FUD1550Params): FileDiagnostic =>
  file(
    'FUD1550',
    'warning',
    p.problem === 'max-age'
      ? 'preload needs a max-age of at least 31536000 (one year): the preload list would refuse the site'
      : 'preload needs includeSubDomains: the preload list would refuse the site',
    p,
  );
