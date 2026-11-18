import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** The runtime marker anywhere but the `<head>` of a layout: the runtime is the layout's (SDD-88). */
export const FUD1583 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD1583',
    'error',
    'the runtime is the layout\'s: <script src="fudic:runtime"> goes directly inside the <head> of a layout',
    p,
  );
