import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** An `@raw(…)` that is not the only content of its element (decision 18). */
export const FUD0990 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0990',
    'error',
    '`@raw(…)` must be the only content of an element, e.g. `<div class="post">@raw(html)</div>`',
    p,
  );
