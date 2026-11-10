import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1462`. */
export interface FUD1462Params extends SourceInput {
  /** What the handler sits on, as written: `<div>`, `<user-form>`, `bus:alta`, `@fudic:result`. */
  readonly where: string;
}

/** `$value` in a handler with no control to read it from (SDD-80). */
export const FUD1462 = (p: FUD1462Params): SourceDiagnostic =>
  source(
    'FUD1462',
    'error',
    `\`$value\` is the value of the control that fired the event, and ${p.where} has none`,
    p,
  );
