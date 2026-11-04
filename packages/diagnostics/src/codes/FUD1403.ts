import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD1403`. */
export interface FUD1403Params {
  /** The topic as it was asked for. */
  readonly topic: string;
  /** The topics that exist. */
  readonly topics: readonly string[];
}

/** `fudic_guide` with a topic that does not exist, or a code that is not in the catalogue (SDD-77). */
export const FUD1403 = (p: FUD1403Params): ProjectDiagnostic =>
  project('FUD1403', 'error', `there is no guide topic ${JSON.stringify(p.topic)}; the topics are ${p.topics.join(', ')}, or a code such as FUD0540`);
