import { file } from '../make.js';
import type { FileDiagnostic } from '../types.js';

/** Parameters of `FUD1516`. */
export interface FUD1516Params {
  /** The route's fixture file. */
  readonly file: string;
  /** The group the name was asked of: `data`, `calls` or `services`. */
  readonly group: 'data' | 'calls' | 'services';
  readonly name: string;
  /** Every name the group has. */
  readonly available: readonly string[];
}

/** `fudic_render` or `fudic_preview` of a route with a fixture name its fixture does not have (SDD-82). */
export const FUD1516 = (p: FUD1516Params): FileDiagnostic =>
  file('FUD1516', 'error', `the fixture has no ${p.group} "${p.name}"; it has: [${p.available.join(', ')}]`, p);
