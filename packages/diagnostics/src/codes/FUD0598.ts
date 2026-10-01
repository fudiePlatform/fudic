import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0598`. */
export type FUD0598Params = SourceInput & {
  /** The node the marker names, as written: `f.title`. */
  readonly node: string;
} & (
    | {
        /** The marker sits inside a loop. */
        readonly reason: 'loop';
        /** The marker attribute: `error` or `summary`. */
        readonly attr: string;
      }
    | {
        /** The node already has a marker in this component. */
        readonly reason: 'second';
      }
  );

/** A marker inside a loop, or a second marker for one node (BUG-41). */
export const FUD0598 = (p: FUD0598Params): SourceDiagnostic =>
  source(
    'FUD0598',
    'error',
    p.reason === 'loop'
      ? `a \`${p.attr}\` marker cannot sit inside a loop: every row would carry the same id for \`${p.node}\``
      : `\`${p.node}\` already has a marker in this component: a node speaks through one element`,
    p,
  );
