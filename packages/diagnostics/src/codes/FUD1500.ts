import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1500`. */
export interface FUD1500Params extends SourceInput {
  /** The route as the header writes it: `/usuarios`, `/blog/[slug]`. */
  readonly route: string;
}

/** `page <route>` names a route the project does not have (`.fudspec`) (SDD-82). */
export const FUD1500 = (p: FUD1500Params): SourceDiagnostic =>
  source('FUD1500', 'error', `no page \`${p.route}\`: the routes folder has no page by that path`, p);
