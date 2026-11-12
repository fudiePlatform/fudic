import { file } from '../make.js';
import type { FileDiagnostic } from '../types.js';

/** Parameters of `FUD1517`. */
export interface FUD1517Params {
  /** Where the route's fixture would be: `<route>.fixture.ts`, beside its `.fud`. */
  readonly file: string;
}

/** `fudic_render` or `fudic_preview` of a route with a fixture, when the route has none (SDD-82). */
export const FUD1517 = (p: FUD1517Params): FileDiagnostic =>
  file('FUD1517', 'error', `the route has no fixture: ${p.file} is not there`, p);
