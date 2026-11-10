import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** `$value` on an `<input>` whose `type` is an expression (SDD-80). */
export const FUD1463 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD1463',
    'error',
    '`$value` needs a fixed `type`: this `<input>` sets it with an expression, so its value has no type the compiler can know',
    p,
  );
