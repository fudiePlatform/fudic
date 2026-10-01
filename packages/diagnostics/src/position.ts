/**
 * 2D positions (SDD-13 §3.1). SDD-01 kept everything in offsets on purpose and
 * deferred the line/column form to here; this is the home of `Position`/`Range`.
 * The unit is UTF-16 code units, exactly the LSP `Position`/`Range` — no
 * recoding when handed to an editor.
 */

/** 0-based line and 0-based character, in UTF-16 code units — LSP Position exactly. */
export interface Position {
  readonly line: number;
  readonly character: number;
}

/** A [start, end) range in 2D positions — LSP Range. */
export interface Range {
  readonly start: Position;
  readonly end: Position;
}
