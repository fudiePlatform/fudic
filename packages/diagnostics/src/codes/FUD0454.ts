import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD0454`. */
export interface FUD0454Params {
  /** The app with no `dist`. */
  readonly app: string;
}

/** `fudic preview` over an app that has not been built (BUG-50). */
export const FUD0454 = (p: FUD0454Params): ProjectDiagnostic =>
  project('FUD0454', 'error', `app "${p.app}" has no build to preview: run pnpm build first`);
