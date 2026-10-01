import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** An `inject(…)` written in the `@server` of a route (SDD-38). */
export const FUD0683 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0683',
    'error',
    `A route resolves through \`ctx.inject(…)\`: \`load(ctx)\` is the only async function of the system and takes no ambient container, so \`inject(…)\` here has none to read.`,
    p,
  );
