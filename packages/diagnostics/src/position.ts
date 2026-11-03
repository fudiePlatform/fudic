/**
 * Positions. `Position` and `Range` are the editor's: 0-based, in UTF-16 code units, exactly the
 * LSP ones, so they reach an editor without recoding. `FilePosition` is the reader's: 1-based,
 * with its file, as a report names a place.
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

/**
 * A place in a file, as a person reads it: 1-based line and column (the column counts UTF-16
 * units, as the editor does), and the path relative to the project root, with '/'.
 */
export interface FilePosition {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

/** `"src/components/acme-button/acme-button.fud:22:3"`. */
export function formatPosition(position: FilePosition): string {
  return `${position.file}:${position.line}:${position.column}`;
}
