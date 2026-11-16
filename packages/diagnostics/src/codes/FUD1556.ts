import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1556`. */
export interface FUD1556Params extends FileInput {
  readonly directive: string;
  /** What the policy allows for fudic: `'nonce-{nonce}'`, `'unsafe-eval'`, `fudic`. */
  readonly source: string;
}

/** The policy allows something for fudic that nothing fudic emits needs anymore (SDD-84). */
export const FUD1556 = (p: FUD1556Params): FileDiagnostic =>
  file('FUD1556', 'hint', `${p.source} in ${p.directive} is no longer needed by anything fudic emits`, p);
