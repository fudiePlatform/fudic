import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** `fails` under a function or `load`: it belongs to rules and middlewares (SDD-74, decision 175). */
export const FUD1360 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD1360',
    'error',
    "`fails` belongs to rules and middlewares. In a function, throw an error of @fudic/http from its handler: conflict('…'), notFound('…').",
    p,
  );
