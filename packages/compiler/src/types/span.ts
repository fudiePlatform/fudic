/**
 * `Span` lives in `@fudic/diagnostics` (SDD-50 §4.1): a diagnostic is built from a span, so the
 * span belongs where diagnostics are. Re-exported so the compiler's vocabulary is unchanged.
 */

export type { Span } from '@fudic/diagnostics';
export {
  span,
  emptySpan,
  spanLength,
  isEmptySpan,
  mergeSpans,
  spanContains,
} from '@fudic/diagnostics';
