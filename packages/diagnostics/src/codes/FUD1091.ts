import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Why the route takes no `paths`. */
export type FUD1091Reason = 'no-params' | 'error';

/** Parameters of `FUD1091`. */
export type FUD1091Params = SourceInput & {
  readonly reason: FUD1091Reason;
};

const WHY: Readonly<Record<FUD1091Reason, string>> = {
  'no-params': 'this route has no parameters to enumerate',
  error: 'the `_error` page has no URLs of its own to enumerate',
};

/** `paths` where there is nothing to enumerate (SDD-60). */
export const FUD1091 = (p: FUD1091Params): SourceDiagnostic =>
  source('FUD1091', 'error', `\`paths\` has nothing to do here: ${WHY[p.reason]}`, p);
