import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0801`. */
export interface FUD0801Params {
  /** The piece the published runtime lacks. */
  readonly name: string;
}

/** The published runtime lacks a piece every hydrating route needs (SDD-45). */
export const FUD0801 = (p: FUD0801Params): ProjectDiagnostic =>
  project(
    'FUD0801',
    'error',
    'the published runtime of this build has no ' +
      `"${p.name}", which every route that hydrates has to start. Run the publisher's ` +
      'build, or check that its version is the one this project resolves.',
  );
