import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1160`. */
export interface FUD1160Params extends SourceInput {
  /** The name as written, e.g. `className`. */
  readonly name: string;
  /** The HTML attribute it stands for. */
  readonly html: 'class' | 'for';
}

/** `className` or `htmlFor` written as an attribute: React's name, not HTML's (SDD-62). */
export const FUD1160 = (p: FUD1160Params): SourceDiagnostic =>
  source('FUD1160', 'error', `\`${p.name}\` is a React prop name: the HTML attribute is \`${p.html}\``, p);
