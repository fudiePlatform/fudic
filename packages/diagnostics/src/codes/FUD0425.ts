import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A layout with no `@RenderHead()` (SDD-21). */
export const FUD0425 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0425',
    'warning',
    "a layout without @RenderHead() appends the route's head contributions at the end of <head>",
    p,
  );
