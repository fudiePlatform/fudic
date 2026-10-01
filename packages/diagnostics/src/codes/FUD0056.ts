import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** An attribute value written without quotes (SDD-05). */
export const FUD0056 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0056', 'error', 'attribute value must be quoted', p);
