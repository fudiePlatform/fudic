import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0665`. */
export interface FUD0665Params extends SourceInput {
  /** The event that does not bubble. */
  readonly event: string;
  /** The bubbling event to use instead, when there is one. */
  readonly substitute?: string;
}

/** A delegated handler on an event that does not bubble (SDD-37). */
export const FUD0665 = (p: FUD0665Params): SourceDiagnostic =>
  source(
    'FUD0665',
    'error',
    `\`${p.event}\` does not bubble, so it can never be delegated${p.substitute === undefined ? '' : `, use \`@${p.substitute}\``}`,
    p,
  );
