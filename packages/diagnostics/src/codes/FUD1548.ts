import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1548`. */
export interface FUD1548Params extends FileInput {
  /** The directive that decides, as the browser reads it. */
  readonly directive: string;
  /** The source the piece needs: `'unsafe-eval'`. */
  readonly source: string;
  /** The piece of the Service Worker that needs it: `the route linker`. */
  readonly piece: string;
}

/** The Service Worker policy blocks its linker (SDD-84). */
export const FUD1548 = (p: FUD1548Params): FileDiagnostic =>
  file(
    'FUD1548',
    'warning',
    `${p.directive} blocks ${p.piece}, which needs ${p.source}: the app is served without its Service Worker`,
    p,
  );
