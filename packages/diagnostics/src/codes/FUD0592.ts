import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/**
 * A `control` on an element that cannot carry a user value (SDD-34): a `submit`, `reset`,
 * `button` or `image` input. `<input type="file">` was the other face until it gained a binding.
 */
export const FUD0592 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0592',
    'error',
    '`control` needs an element that carries a user value: `submit`, `reset`, `button` and `image` inputs have none',
    p,
  );
