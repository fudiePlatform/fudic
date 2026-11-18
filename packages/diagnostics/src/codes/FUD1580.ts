import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A file that starts with `<!DOCTYPE` and has no hole: a whole document is a layout (SDD-88). */
export const FUD1580 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD1580',
    'error',
    'a file with <!DOCTYPE html> is a layout and needs @RenderBody(); a page writes no doctype and links its layout with <link rel="layout">',
    p,
  );
