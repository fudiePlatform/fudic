import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0442`. */
export interface FUD0442Params {
  /** The tag as given. */
  readonly tag: string;
}

/** `fudic g` given a hyphenated name the HTML/SVG/MathML specs reserve (SDD-22). */
export const FUD0442 = (p: FUD0442Params): ProjectDiagnostic =>
  project('FUD0442', 'error', `"${p.tag}" is reserved by the HTML/SVG/MathML specs and cannot be defined`);
