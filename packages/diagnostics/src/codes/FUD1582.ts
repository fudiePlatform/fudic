import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** Parameters of `FUD1582`. */
export interface FUD1582Params {
  /** Every file the CLI looked at, nearest first. */
  readonly searched: readonly string[];
  /** The command that creates the layout: `fudic g layout _layout`, with `--project` when it applies. */
  readonly create: string;
}

/** `g page`, `g error-page` or `g showcase` find no layout to link (SDD-88). */
export const FUD1582 = (p: FUD1582Params): ProjectDiagnostic =>
  project(
    'FUD1582',
    'error',
    `no layout to link (looked for ${p.searched.join(', ')}): create one with \`${p.create}\` or pick one with --layout <href>`,
  );
