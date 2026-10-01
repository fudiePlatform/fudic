import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A framework `<link>` below the top level of a component or a route (SDD-21). */
export const FUD0438 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0438',
    'error',
    'A <link rel="component">, <link rel="layout"> or <link rel="snippet"> is a top-level node of the file: nested it registers nothing',
    p,
  );
