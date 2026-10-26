import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1072`. */
export type FUD1072Params = SourceInput;

/** A `.fudapi` function whose body is a form and arguments at once (SDD-60). */
export const FUD1072 = (p: FUD1072Params): SourceDiagnostic =>
  source('FUD1072', 'error', 'a function with `form` takes no body arguments: the form is its body', p);
