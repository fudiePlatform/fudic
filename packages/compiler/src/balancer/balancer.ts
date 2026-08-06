/**
 * The delimiter balancer (SDD-02). A lexically aware scanner that, given the
 * offset of an opening delimiter, walks forward counting nesting depth until the
 * delimiter that balances it, skipping the opaque regions (strings, templates,
 * comments, regex literals) where delimiters must NOT be counted.
 *
 * It does NOT validate JS: it only locates the boundary so SDD-11 can hand the
 * inner substring to Oxc. It never throws; unterminated input degrades the value
 * and emits a located Diagnostic.
 */

import { type Span, span, emptySpan } from '../types/index.js';
import { type Diagnostic, errorDiag } from '../types/index.js';
import { type ParseResult, ok, withDiagnostics } from '../types/index.js';

/**
 * Kind of opaque lexical region the balancer skipped over while counting. These
 * are the JS constructs inside which delimiters DO NOT count toward balancing.
 * 'template' covers the whole template literal; its `${ ... }` interpolations are
 * NOT opaque (delimiters inside them count again) and are not listed as regions,
 * though an opaque region nested inside an interpolation is listed on its own.
 */
export type LexRegionKind =
  | 'string' // '...' or "..."
  | 'template' // `...` (including its `${}` substitutions, as one region)
  | 'line-comment' // // ... up to end of line
  | 'block-comment' // /* ... */
  | 'regex' // /.../flags
  | 'razor-comment'; // @* ... *@ — Fudic, not JS; only when the caller opts in

/** Per-call scanning options. Absent means the JS-only behaviour every caller had. */
export interface ScanOptions {
  /**
   * Recognize `@* … *@` as an opaque region (BUG-13 §4). Off by default: the balancer
   * scans JavaScript, and only the body of `@code` can hold a Razor comment mixed into
   * it. With it on, the braces and the `@client` written inside a comment stop counting,
   * so a comment can never move where the block ends.
   */
  readonly razorComments?: boolean;
}

/**
 * One opaque region found inside a balanced group. Its span covers the region in
 * full, delimiters included (the quotes, the slashes, the comment markers). The
 * balancer already walked every one of these while scanning; emitting them lets
 * SDD-11 reuse the work instead of re-lexing the substring for Oxc.
 */
export interface LexRegion {
  readonly kind: LexRegionKind;
  readonly span: Span;
}

/**
 * Result of balancing a delimited group. The `value` is ALWAYS present, even when
 * the group is not closed (degraded result): the parser never throws (SDD-01).
 */
export interface BalancedGroup {
  /**
   * The full group, opening delimiter included. When `closed` is true, the closing
   * delimiter is included too: [openOffset, closeOffset + 1). When `closed` is false
   * (EOF reached first), it runs to the end of source: [openOffset, source.length).
   */
  readonly span: Span;

  /**
   * The content BETWEEN the delimiters — what gets handed to Oxc. When `closed`:
   * [openOffset + 1, closeOffset). When not closed: [openOffset + 1, source.length).
   * Empty span when the group is empty (e.g. `()`).
   */
  readonly inner: Span;

  /**
   * True iff the matching closing delimiter was found. False ⇒ EOF was reached
   * first and the result is degraded; a diagnostic is present in the ParseResult.
   */
  readonly closed: boolean;

  /** Opaque lexical regions found inside the group, in source order. */
  readonly regions: readonly LexRegion[];
}

/** The closing delimiters the balancer understands. The opener is implied by it. */
export type Closer = ')' | ']' | '}';

/** Opening delimiter that pairs with each closer. */
const OPENER_OF: Readonly<Record<Closer, string>> = {
  ')': '(',
  ']': '[',
  '}': '{',
};

/**
 * Keywords after which a `/` starts a regex literal, not a division: they are
 * identifiers lexically, but they never produce a value (SDD-02 §4.4).
 */
const REGEX_FORCING_KEYWORDS: ReadonlySet<string> = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'do',
  'else',
  'yield',
  'await',
  'case',
]);

const WHITESPACE = /\s/u;
const IDENT_START = /[\p{ID_Start}$_]/u;
const IDENT_PART = /[\p{ID_Continue}$]/u;
const DIGIT = /[0-9]/u;
/** Characters that may continue a numeric literal (0x1F, 1.5, 1e10, 1n, 1_000). */
const NUMBER_PART = /[\p{ID_Continue}.]/u;
const ASCII_LETTER = /[a-zA-Z]/u;

/** LF, CR, LINE SEPARATOR, PARAGRAPH SEPARATOR: the four JS line terminators. */
const LINE_TERMINATORS: ReadonlySet<number> = new Set([0x0a, 0x0d, 0x2028, 0x2029]);

/** A string or a regex literal may not span a line terminator. */
function isLineTerminator(c: string): boolean {
  return LINE_TERMINATORS.has(c.charCodeAt(0));
}

/**
 * Stateful cursor over one source text, accumulating the regions walked and the
 * diagnostics emitted. Internal to this module: the public API is a pure
 * function, and a fresh Scanner is built per call.
 */
class Scanner {
  readonly #source: string;
  readonly #length: number;
  readonly #razorComments: boolean;
  readonly #regions: LexRegion[] = [];
  readonly #diagnostics: Diagnostic[] = [];

  constructor(source: string, options: ScanOptions) {
    this.#source = source;
    this.#length = source.length;
    this.#razorComments = options.razorComments ?? false;
  }

  /**
   * Regions walked, in source order. Sorting matters because a region nested in
   * a template interpolation finishes — and so is recorded — before the template
   * that encloses it.
   */
  get regions(): readonly LexRegion[] {
    return [...this.#regions].sort((a, b) => a.span.start - b.span.start);
  }

  get diagnostics(): readonly Diagnostic[] {
    return this.#diagnostics;
  }

  /**
   * Scans the group opening at `openOffset`. Returns the offset just past the
   * closing delimiter, or the end of source when it was never found.
   */
  scan(openOffset: number, closer: Closer): { end: number; closed: boolean } {
    return this.#scanGroup(openOffset, closer);
  }

  #region(kind: LexRegionKind, start: number, end: number): void {
    this.#regions.push({ kind, span: span(start, Math.min(end, this.#length)) });
  }

  #error(code: string, message: string, at: number): void {
    this.#diagnostics.push(errorDiag(code, message, emptySpan(at)));
  }

  /**
   * Counts delimiters in code context until the one that balances `openOffset`.
   * Depth is tracked per delimiter type and balanced independently: locating the
   * closer is this module's job, validating the nesting is Oxc's (§4.2).
   */
  #scanGroup(openOffset: number, closer: Closer): { end: number; closed: boolean } {
    let parens = closer === ')' ? 1 : 0;
    let brackets = closer === ']' ? 1 : 0;
    let braces = closer === '}' ? 1 : 0;

    /** Class of the last significant token: does a `/` here divide or open a regex? */
    let valueBefore = false;
    let i = openOffset + 1;

    while (i < this.#length) {
      const c = this.#source[i];
      if (c === undefined) break;

      if (WHITESPACE.test(c)) {
        i++;
        continue;
      }

      if (c === '/') {
        // Comment markers win over the regex/division decision: a comment is a
        // comment whatever the previous token was.
        const next = this.#source[i + 1];
        if (next === '/') {
          i = this.#scanLineComment(i);
          continue;
        }
        if (next === '*') {
          i = this.#scanBlockComment(i);
          continue;
        }
        if (valueBefore) {
          i++;
          valueBefore = false;
          continue;
        }
        i = this.#scanRegex(i);
        valueBefore = true;
        continue;
      }

      if (c === "'" || c === '"') {
        i = this.#scanString(i, c);
        valueBefore = true;
        continue;
      }

      if (c === '`') {
        i = this.#scanTemplate(i);
        valueBefore = true;
        continue;
      }

      if (c === '@' && this.#razorComments && this.#source[i + 1] === '*') {
        i = this.#scanRazorComment(i);
        valueBefore = false;
        continue;
      }

      if (c === '(' || c === '[' || c === '{') {
        if (c === '(') parens++;
        else if (c === '[') brackets++;
        else braces++;
        valueBefore = false;
        i++;
        continue;
      }

      if (c === ')' || c === ']' || c === '}') {
        if (c === ')') parens--;
        else if (c === ']') brackets--;
        else braces--;
        i++;
        const depth = c === ')' ? parens : c === ']' ? brackets : braces;
        if (c === closer && depth === 0) return { end: i, closed: true };
        // `}` is treated as a block close, so a following `/` is a regex (§4.4).
        valueBefore = c !== '}';
        continue;
      }

      if (IDENT_START.test(c)) {
        const start = i;
        i++;
        while (i < this.#length) {
          const p = this.#source[i];
          if (p === undefined || !IDENT_PART.test(p)) break;
          i++;
        }
        valueBefore = !REGEX_FORCING_KEYWORDS.has(this.#source.slice(start, i));
        continue;
      }

      if (DIGIT.test(c)) {
        i++;
        while (i < this.#length) {
          const p = this.#source[i];
          if (p === undefined || !NUMBER_PART.test(p)) break;
          i++;
        }
        valueBefore = true;
        continue;
      }

      // Any other operator or punctuator: not value-producing.
      i++;
      valueBefore = false;
    }

    return { end: this.#length, closed: false };
  }

  /** `'...'` / `"..."`. A backslash escapes the next char. May not span a line break. */
  #scanString(start: number, quote: string): number {
    let i = start + 1;
    while (i < this.#length) {
      const c = this.#source[i];
      if (c === undefined || isLineTerminator(c)) break;
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === quote) {
        this.#region('string', start, i + 1);
        return i + 1;
      }
      i++;
    }
    const end = Math.min(i, this.#length);
    this.#region('string', start, end);
    this.#error('FUD0003', 'Unterminated string literal', end);
    return end;
  }

  /**
   * A template literal. A backslash escapes the next char. A `${` reopens code
   * context: its content is scanned as a group closed by `}`, so delimiters
   * inside it count again. The emitted region covers the whole template,
   * interpolations included.
   */
  #scanTemplate(start: number): number {
    let i = start + 1;
    while (i < this.#length) {
      const c = this.#source[i];
      if (c === undefined) break;
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === '`') {
        this.#region('template', start, i + 1);
        return i + 1;
      }
      if (c === '$' && this.#source[i + 1] === '{') {
        i = this.#scanGroup(i + 1, '}').end;
        continue;
      }
      i++;
    }
    this.#region('template', start, this.#length);
    this.#error('FUD0004', 'Unterminated template literal', this.#length);
    return this.#length;
  }

  /** A line comment, up to the line break (excluded) or EOF. Never an error. */
  #scanLineComment(start: number): number {
    let i = start + 2;
    while (i < this.#length) {
      const c = this.#source[i];
      if (c === undefined || isLineTerminator(c)) break;
      i++;
    }
    this.#region('line-comment', start, i);
    return i;
  }

  /** A block comment. Spans line breaks; ends at the closing marker. */
  #scanBlockComment(start: number): number {
    let i = start + 2;
    while (i < this.#length) {
      if (this.#source[i] === '*' && this.#source[i + 1] === '/') {
        this.#region('block-comment', start, i + 2);
        return i + 2;
      }
      i++;
    }
    this.#region('block-comment', start, this.#length);
    this.#error('FUD0005', 'Unterminated block comment', this.#length);
    return this.#length;
  }

  /**
   * `@* … *@`, when the caller asked for it. Not nestable: the first `*@` closes
   * (decision 36), as a JS block comment and an HTML comment also do.
   *
   * An unterminated one gets no code of its own. It runs to the end of the source, so
   * the group that contains it cannot close either, and that is already FUD0002 — a
   * second diagnostic would only say the same thing twice.
   */
  #scanRazorComment(start: number): number {
    let i = start + 2;
    while (i < this.#length) {
      if (this.#source[i] === '*' && this.#source[i + 1] === '@') {
        this.#region('razor-comment', start, i + 2);
        return i + 2;
      }
      i++;
    }
    this.#region('razor-comment', start, this.#length);
    return this.#length;
  }

  /**
   * A regex literal with its flags. The closing slash is the first unescaped one
   * outside a `[...]` class. May not span a line break.
   */
  #scanRegex(start: number): number {
    let i = start + 1;
    let inClass = false;
    while (i < this.#length) {
      const c = this.#source[i];
      if (c === undefined || isLineTerminator(c)) break;
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === '[') {
        inClass = true;
      } else if (c === ']') {
        inClass = false;
      } else if (c === '/' && !inClass) {
        i++;
        while (i < this.#length) {
          const f = this.#source[i];
          if (f === undefined || !ASCII_LETTER.test(f)) break;
          i++;
        }
        this.#region('regex', start, i);
        return i;
      }
      i++;
    }
    const end = Math.min(i, this.#length);
    this.#region('regex', start, end);
    this.#error('FUD0006', 'Unterminated regular expression literal', end);
    return end;
  }
}

/**
 * Scans a balanced delimited group. `openOffset` MUST point at the opening
 * delimiter that pairs with `closer` ( '(' for ')', '[' for ']', '{' for '}' ).
 *
 * Never throws. On unterminated input it returns a degraded BalancedGroup
 * (`closed: false`) plus a located Diagnostic. If `openOffset` does not point at
 * the expected opener (caller bug) it returns an empty degraded group with
 * FUD0007 and does not scan.
 */
export function scanBalanced(
  source: string,
  openOffset: number,
  closer: Closer,
  options: ScanOptions = {},
): ParseResult<BalancedGroup> {
  const opener = OPENER_OF[closer];
  if (source[openOffset] !== opener) {
    const at = emptySpan(openOffset);
    return withDiagnostics({ span: at, inner: at, closed: false, regions: [] }, [
      errorDiag('FUD0007', `Expected '${opener}' at the opening offset`, at),
    ]);
  }

  const scanner = new Scanner(source, options);
  const { end, closed } = scanner.scan(openOffset, closer);
  const group: BalancedGroup = {
    span: span(openOffset, end),
    inner: span(openOffset + 1, closed ? end - 1 : end),
    closed,
    regions: scanner.regions,
  };

  const diagnostics = scanner.diagnostics;
  if (!closed && diagnostics.length === 0) {
    // No opaque region was left unterminated: the group itself just ran out of
    // source. The generic code is emitted only when no specific one exists (§4.5).
    return withDiagnostics(group, [
      errorDiag('FUD0002', `Unterminated group, expected '${closer}'`, emptySpan(source.length)),
    ]);
  }
  return diagnostics.length === 0 ? ok(group) : withDiagnostics(group, diagnostics);
}

/** Thin wrapper: scans a `( ... )` group. `at` points at the `(`. */
export function scanParens(source: string, at: number): ParseResult<BalancedGroup> {
  return scanBalanced(source, at, ')');
}

/** Thin wrapper: scans a `[ ... ]` group. `at` points at the `[`. */
export function scanBrackets(source: string, at: number): ParseResult<BalancedGroup> {
  return scanBalanced(source, at, ']');
}

/** Thin wrapper: scans a `{ ... }` group. `at` points at the `{`. */
export function scanBraces(
  source: string,
  at: number,
  options: ScanOptions = {},
): ParseResult<BalancedGroup> {
  return scanBalanced(source, at, '}', options);
}
