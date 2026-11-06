import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Why there is nothing to look at. */
export type FUD1426Reason = 'route' | 'no-fixture' | 'no-cases';

/** Parameters of `FUD1426`; `file` is the piece. */
export interface FUD1426Params extends FileInput {
  readonly reason: FUD1426Reason;
}

const WHY: Readonly<Record<FUD1426Reason, string>> = {
  route: 'it is a route, and only a component has a look',
  'no-fixture': 'it has no fixture',
  'no-cases': 'its fixture has no cases',
};

/** `fudic_look` of a route, or of a component without a fixture or its cases (SDD-78). */
export const FUD1426 = (p: FUD1426Params): FileDiagnostic =>
  file('FUD1426', 'error', `nothing to look at in ${p.file}: ${WHY[p.reason]}`, p);
