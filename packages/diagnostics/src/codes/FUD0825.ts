import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `<head>` inside a `@snippet` body (SDD-29). */
export const FUD0825 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0825', 'error', 'a @snippet has no <head>: it is markup, not a document', p);
