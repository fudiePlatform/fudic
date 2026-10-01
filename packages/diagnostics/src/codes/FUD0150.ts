import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A doctype other than `<!DOCTYPE html>` (SDD-10). */
export const FUD0150 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0150', 'error', 'The doctype must be <!DOCTYPE html>', p);
