/**
 * The diagnostics of `fudic.json` (SDD-41 §5). Range `FUD0720`–`FUD0739`.
 *
 * Every one of them is about the CONFIGURATION FILE, never about a `.fud`: the prefix is a
 * guide and is not checked, so no component gains a diagnostic from this SDD.
 */

/** Offsets into the file's text, `[start, end)`. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

export interface ConfigDiagnostic {
  readonly code: string; // FUD0720–FUD0739
  readonly message: string;
  /** The file the diagnostic is about, relative to the project root. */
  readonly file: string;
  /**
   * Where the guilty field is, so the editor can underline it instead of the whole file.
   *
   * It spans the KEY and not its value: the key is what names the field, it is what the
   * message talks about, and finding it needs no second JSON parser. Absent when there is
   * nothing to point at — the file could not be read, the JSON does not parse, or the key
   * is spelled with escapes and so is not in the text as written.
   */
  readonly span?: Span;
}

/** `fudic.json` is unreadable or has an invalid shape. One per guilty field. */
export const FUD_CONFIG_MALFORMED = 'FUD0720';

/** The project has a `sw.json` and its `fudic.json` declares no `id`. */
export const FUD_CONFIG_ID_REQUIRED = 'FUD0721';

/*
 * FUD0722 is RESERVED AND DELIBERATELY UNUSED. It was, in two drafts, "the tag does not
 * carry the project's prefix" — first a warning, then an error. Both times it was wrong:
 * the prefix is a guide, and the naming convention of a project belongs to whoever writes
 * the project. What does break — two components defining the same tag — is FUD0761.
 */

/** `kind: "lib"` in a project that has a `sw.json` or a non-empty routes directory. */
export const FUD_CONFIG_LIB_WITH_DEPLOYMENT = 'FUD0723';

/** Two projects of the workspace declare the same `id`. Never emitted by the plugin. */
export const FUD_CONFIG_DUPLICATE_ID = 'FUD0724';
