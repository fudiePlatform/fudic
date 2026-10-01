import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `<link rel="component">` outside the `<head>` of a page (SDD-10). */
export const FUD0152 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0152', 'error', '<link rel="component"> must live inside <head>', p);
