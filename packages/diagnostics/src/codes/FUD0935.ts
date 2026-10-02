import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A quote inside a bare argument, or a malformed `role:` reference (`.fudspec`). */
export const FUD0935 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0935', 'error', 'malformed argument: a quote opens a whole argument or the name of a `role:` reference', p);
