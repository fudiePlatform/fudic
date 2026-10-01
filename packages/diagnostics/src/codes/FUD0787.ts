import { file } from '../make.js';
import type { FileDiagnostic } from '../types.js';

/** Parameters of `FUD0787`. */
export interface FUD0787Params {
  /** The file `--in` names, as written. */
  readonly file: string;
  /** The library the component is generated into. */
  readonly library: string;
}

/**
 * `fudic g component --in` across packages, for a component its library does not export: from
 * outside the library it has no name, so there is no `href` to write (SDD-35, SDD-44).
 */
export const FUD0787 = (p: FUD0787Params): FileDiagnostic =>
  file(
    'FUD0787',
    'error',
    `--in ${p.file}: ${p.library} does not export this component, so no other package can link it; generate it under a folder its "exports" lists`,
    p,
  );
