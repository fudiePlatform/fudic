import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `@code` block outside the `<head>` of a page (SDD-10). */
export const FUD0153 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0153', 'error', '@code must live inside <head>', p);
