import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD1410`. */
export interface FUD1410Params {
  /** The event that needs one: `accepted` or `reopened`. */
  readonly event: string;
}

/** `fudic_record` of an event that is written with the person's words, without them (SDD-77). */
export const FUD1410 = (p: FUD1410Params): ProjectDiagnostic =>
  project('FUD1410', 'error', `"${p.event}" is recorded with a text: what the user said, in their words`);
