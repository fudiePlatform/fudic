import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A `class:` binding on the component's own host tag (BUG-32). */
export const FUD0720 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0720',
    'error',
    '`class:` on the component\'s own tag styles nothing: the classes of this file live inside its shadow, and a class on the host is resolved against the page — write the class where it applies, or expose the state as an attribute',
    p,
  );
