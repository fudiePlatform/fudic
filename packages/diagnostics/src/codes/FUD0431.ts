import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `@RenderHead()` outside the layout's `<head>` (SDD-21). */
export const FUD0431 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0431', 'error', '@RenderHead() must live inside <head>', p);
