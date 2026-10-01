import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A native `on*` event attribute, which fudic's Content-Security-Policy never runs (SDD-51). */
export const FUD0909 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0909',
    'error',
    'native event attributes are inline scripts the Content-Security-Policy blocks: bind the event with `@event`',
    p,
  );
