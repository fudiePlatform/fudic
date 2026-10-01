import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0362`. */
export interface FUD0362Params {
  /** The `paths()` entry, as printed. */
  readonly entry: string;
  /** The route pattern. */
  readonly pattern: string;
}

/** A `paths()` entry that does not cover every param of its route (SDD-19). */
export const FUD0362 = (p: FUD0362Params): ProjectDiagnostic =>
  project('FUD0362', 'warning', `paths() entry ${p.entry} does not cover every param of ${p.pattern}`);
