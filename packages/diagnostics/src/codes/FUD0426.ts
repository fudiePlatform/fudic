import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `Render*` directive outside a layout (SDD-21). */
export const FUD0426 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0426', 'error', '@RenderBody/@RenderHead/@RenderSection are only valid in a layout', p);
