import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `<script>` of code that carries an inline body (SDD-10). */
export const FUD0161 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0161',
    'error',
    'a `<script>` of code cannot carry a body: fudic does not support inline script, and the body is not emitted. Move the code to a file and reference it with `src`. Data blocks are supported inline: `application/ld+json` and `importmap`',
    p,
  );
