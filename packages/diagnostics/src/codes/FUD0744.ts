import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0744`. */
export interface FUD0744Params extends SourceInput {
  /** The sheet name the template chooses. */
  readonly name: string;
  /** The names the component may choose from, in the order its `fudic.json` declares them. */
  readonly choosable: readonly string[];
}

/** `shadowrootadoptedstylesheets` names a sheet the project does not declare (SDD-46). */
export const FUD0744 = (p: FUD0744Params): SourceDiagnostic =>
  source(
    'FUD0744',
    'error',
    `"${p.name}" is not a stylesheet of this project: a component chooses from the "styles" of its fudic.json` +
      (p.choosable.length === 0 ? ', and it declares none' : ` (${p.choosable.join(', ')})`),
    p,
  );
