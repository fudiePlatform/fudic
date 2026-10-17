import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0456`. */
export type FUD0456Params =
  /** A name a stylesheet cannot have: it is the name the HTML adopts it by. */
  | { readonly problem: 'name'; readonly name: string }
  /** A name `globalStyles` already has. */
  | { readonly problem: 'taken'; readonly name: string; readonly path: string };

/** `fudic g style` with a name it cannot use (BUG-50). */
export const FUD0456 = (p: FUD0456Params): ProjectDiagnostic =>
  project(
    'FUD0456',
    'error',
    p.problem === 'name'
      ? `invalid stylesheet name "${p.name}": letters, digits and _, starting with a letter, and no hyphen`
      : `the project already has a global stylesheet "${p.name}" (${p.path})`,
  );
