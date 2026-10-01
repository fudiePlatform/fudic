import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `<link rel="layout">` with no `href` (SDD-21). */
export const FUD0436 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0436', 'error', '<link rel="layout"> requires a static href', p);
