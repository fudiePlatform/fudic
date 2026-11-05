import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD1428`. */
export interface FUD1428Params {
  /** The prop whose value is not JSON. */
  readonly prop: string;
}

/** A prop that is not JSON where it has to cross to a browser or to the preview (SDD-78). */
export const FUD1428 = (p: FUD1428Params): ProjectDiagnostic =>
  project('FUD1428', 'error', `the prop ${p.prop} is not JSON, so it cannot be rendered in the browser`);
