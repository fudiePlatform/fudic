import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** `@await` in the `<head>`, a component, a layout or a snippet body (SDD-70). */
export const FUD1322 = (p: SourceInput): SourceDiagnostic =>
  source('FUD1322', 'error', '`@await` goes in the body of a route or a page, not in the head, a component, a layout or a snippet', p);
