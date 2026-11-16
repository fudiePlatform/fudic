import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1545`. */
export interface FUD1545Params extends FileInput {
  /** The directive that decides, as the browser reads it (`script-src`, or `default-src` behind it). */
  readonly directive: string;
  /** The source that would let it in: `'nonce-{nonce}'`, `fudic`. */
  readonly source: string;
  /** What fudic emitted that needs it: `the style polyfill`, `the Trusted Types policy`. */
  readonly piece: string;
}

/** The page policy blocks something fudic emitted (SDD-84). */
export const FUD1545 = (p: FUD1545Params): FileDiagnostic =>
  file('FUD1545', 'error', `${p.directive} blocks ${p.piece}: it needs ${p.source}`, p);
