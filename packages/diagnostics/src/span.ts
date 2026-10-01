/**
 * `Span` — the offset-based location unit carried by every token and every AST
 * node. Physical substrate of the LSP invariants (SDD-01 §3.1, §4.1).
 */

/**
 * Half-open range [start, end) in UTF-16 character offsets over the original
 * source text of the .fud file (the same unit the editor and the LSP protocol
 * use). NEVER lines/columns: the conversion to a 2D position is deferred to a
 * LineMap in SDD-13.
 */
export interface Span {
  /** Offset of the first included character. >= 0. */
  readonly start: number;
  /** Offset of the first EXCLUDED character. >= start. end === start ⇒ empty span. */
  readonly end: number;
}

/**
 * Builds a Span. Caller precondition: 0 <= start <= end. If start > end (a bug in
 * the calling phase) it does NOT throw: it normalizes by swapping the offsets —
 * the constructor has no source context to emit a located Diagnostic.
 */
export function span(start: number, end: number): Span {
  return start <= end ? { start, end } : { start: end, end: start };
}

/** Empty span at a position (start === end). Useful for insertions/point errors. */
export function emptySpan(at: number): Span {
  return { start: at, end: at };
}

/** Span length (end - start). 0 ⇒ empty span. */
export function spanLength(s: Span): number {
  return s.end - s.start;
}

/** True if the span is empty (start === end). */
export function isEmptySpan(s: Span): boolean {
  return s.start === s.end;
}

/**
 * Joins two spans into the smallest range covering BOTH (bounding span),
 * swallowing the gap between them when disjoint: this is NOT an interval union.
 * Argument order is irrelevant.
 */
export function mergeSpans(a: Span, b: Span): Span {
  return {
    start: a.start < b.start ? a.start : b.start,
    end: a.end > b.end ? a.end : b.end,
  };
}

/**
 * True if offset is within [span.start, span.end). Primitive of offset-based
 * navigation. Because the range is half-open, an empty span (start === end)
 * contains NO offset: an empty-span node is never the result of a coverage query.
 */
export function spanContains(s: Span, offset: number): boolean {
  return offset >= s.start && offset < s.end;
}
