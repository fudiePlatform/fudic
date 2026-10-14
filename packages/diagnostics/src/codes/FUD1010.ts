import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1010`. */
export type FUD1010Params = SourceInput & {
  /** What `_error.fud` declares: `load`, `paths` or a server function's name. */
  readonly name: string;
};

/** `_error.fud` declaring `load`, `paths` or server functions (SDD-56). */
export const FUD1010 = (p: FUD1010Params): SourceDiagnostic =>
  source(
    'FUD1010',
    'error',
    `\`_error.fud\` is painted with the error as its \`data\` and has no URL of its own, so it cannot declare \`${p.name}\``,
    p,
  );
