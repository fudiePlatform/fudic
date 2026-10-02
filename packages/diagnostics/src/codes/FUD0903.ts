import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** `import( … )` or `import.meta` in the view (SDD-51). */
export const FUD0903 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0903',
    'error',
    'the view cannot reach modules: `import( … )` and `import.meta` belong in `@code`',
    p,
  );
