import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0455`. */
export interface FUD0455Params {
  /** What `fudic add` was given. */
  readonly module: string;
  /** The libraries of the workspace, which it could have been. */
  readonly libraries: readonly string[];
}

/** `fudic add` with something that is neither an optional module nor a library of the workspace (BUG-50). */
export const FUD0455 = (p: FUD0455Params): ProjectDiagnostic =>
  project(
    'FUD0455',
    'error',
    `fudic cannot add "${p.module}": it adds di, forms, http, i18n` +
      (p.libraries.length === 0 ? '' : ` or a library of the workspace (${p.libraries.join(', ')})`),
  );
