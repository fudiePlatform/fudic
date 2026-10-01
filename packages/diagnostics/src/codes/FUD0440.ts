import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0440`. */
export interface FUD0440Params {
  /** The tag as given. */
  readonly tag: string;
}

/** `fudic g` given a tag that is not a valid custom element name (SDD-22). */
export const FUD0440 = (p: FUD0440Params): ProjectDiagnostic =>
  project(
    'FUD0440',
    'error',
    `invalid custom element name "${p.tag}": it must be kebab-case and contain a hyphen (e.g. "app-${p.tag || 'card'}")`,
  );
