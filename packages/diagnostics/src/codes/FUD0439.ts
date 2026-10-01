import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A layout that declares its own `<link rel="layout">` (SDD-21). */
export const FUD0439 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0439',
    'error',
    'a layout cannot declare <link rel="layout">: only a route may name a layout',
    p,
  );
