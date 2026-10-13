import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A props spread whose object is not a name or a property path, or that takes a value. */
export const FUD0991 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0991',
    'error',
    'a props spread names the object to spread and takes no value, e.g. `<app-card ...item>`',
    p,
  );
