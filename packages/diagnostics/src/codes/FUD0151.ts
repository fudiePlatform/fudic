import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0151`. */
export interface FUD0151Params extends SourceInput {
  /** What is wrong: no `<html>` root, or `<head>`/`<body>` missing or out of order. */
  readonly missing: 'html' | 'head-body';
}

/** A page whose `<html>`/`<head>`/`<body>` skeleton is missing or misordered (SDD-10). */
export const FUD0151 = (p: FUD0151Params): SourceDiagnostic =>
  source(
    'FUD0151',
    'error',
    p.missing === 'html'
      ? 'A page must have an <html> root'
      : 'A page must have <head> then <body> inside <html>',
    p,
  );
