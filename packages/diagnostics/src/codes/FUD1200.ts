import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD1200`. */
export interface FUD1200Params {
  /** The route the criterion opens. */
  readonly route: string;
  /** What the page answered; null when nothing answered. */
  readonly status: number | null;
}

/** The page of a criterion answered nothing, or a status of 400 or more (SDD-64). */
export const FUD1200 = (p: FUD1200Params): ProjectDiagnostic =>
  project(
    'FUD1200',
    'error',
    p.status === null ? `the page ${p.route} did not answer` : `the page ${p.route} answered ${p.status}`,
  );
