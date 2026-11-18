import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1563`. */
export interface FUD1563Params extends SourceInput {
  /** The prop the hook reads. */
  readonly name: string;
}

/** A layout's lifecycle hook that reads a prop of the layout, whose value only the server has (SDD-86). */
export const FUD1563 = (p: FUD1563Params): SourceDiagnostic =>
  source(
    'FUD1563',
    'error',
    `${p.name} is a prop of the layout, resolved on the server: a hook runs in the browser, where it has no value`,
    p,
  );
