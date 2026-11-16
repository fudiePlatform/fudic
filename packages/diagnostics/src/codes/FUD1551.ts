import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1551`. */
export interface FUD1551Params extends FileInput {
  /** The path of the rule. */
  readonly pattern: string;
  /** One file of the build the Service Worker precaches and the rule covers. */
  readonly path: string;
  /** `no-cache` or `no-store`. */
  readonly directive: string;
}

/** A cache rule that makes the Service Worker download a file the page just downloaded (SDD-84). */
export const FUD1551 = (p: FUD1551Params): FileDiagnostic =>
  file(
    'FUD1551',
    'warning',
    `${p.directive} on ${p.pattern} makes the Service Worker download ${p.path} again, which it precaches`,
    p,
  );
