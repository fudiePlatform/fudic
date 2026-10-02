import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** `this`, `super`, `arguments` or `new.target` in the view (SDD-51). */
export const FUD0904 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0904',
    'error',
    'the view has no implicit context: `this`, `super`, `arguments` and `new.target` mean whatever the emitted render makes them mean',
    p,
  );
