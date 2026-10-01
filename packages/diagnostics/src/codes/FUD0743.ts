import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0743`. */
export interface FUD0743Params extends SourceInput {
  /** The document-only selector found: `:root`, `html` or `body`. */
  readonly selector: string;
}

/** A project stylesheet rule whose selector only matches in the document (SDD-42). */
export const FUD0743 = (p: FUD0743Params): SourceDiagnostic =>
  source(
    'FUD0743',
    'warning',
    `a "${p.selector}" rule in a project stylesheet matches nothing inside a shadow root — ` +
      'move it to the document stylesheet, the <link rel="stylesheet"> of the layout',
    p,
  );
