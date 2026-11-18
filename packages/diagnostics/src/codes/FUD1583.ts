import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A route that writes the runtime marker in its `<head>`: the runtime is its layout's (SDD-88). */
export const FUD1583 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD1583',
    'error',
    'a route carries no runtime: the <script src="fudic:runtime"> goes in the <head> of its layout',
    p,
  );
