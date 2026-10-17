import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0457`. */
export interface FUD0457Params {
  /** What was generated: `service` or `form`. */
  readonly kind: string;
  readonly name: string;
}

/** `fudic g service` or `fudic g form` with a name that makes no file and no identifier (BUG-50). */
export const FUD0457 = (p: FUD0457Params): ProjectDiagnostic =>
  project('FUD0457', 'error', `invalid ${p.kind} name "${p.name}": kebab-case, starting with a letter, e.g. "shopping-cart"`);
