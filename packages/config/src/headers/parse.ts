/**
 * One `.headers` file's text → its headers and what is wrong in it. Never throws.
 *
 * The syntax: `Name: value` at column 0, an indented line continues the header above with that
 * header's separator, `#` starts a comment on its own line. In `assets.headers` a path at column 0
 * opens a block, its headers go indented below it and their continuations one level deeper.
 */

import {
  FUD1540,
  FUD1541,
  FUD1542,
  FUD1543,
  FUD1546,
  span,
  type FileDiagnostic,
  type SourceComment,
  type Span,
} from '@fudic/diagnostics';
import { PLACEHOLDERS } from './csp.js';
import { FUDIC_HEADERS, FUDIC_PATHS, KNOWN_HEADERS } from './known.js';
import { nameSpanOf, segmentsOf, type HeaderEntry, type HeadersKind, type Piece } from './segments.js';

/** One block of `assets.headers`: a path and the headers of the files it matches. */
export interface AssetRule {
  /** Without the app's `base`; `*` within a segment, `**` across segments. */
  readonly pattern: string;
  readonly headers: readonly HeaderEntry[];
  /** The path line. */
  readonly span: Span;
}

/** The three files' names, by what they govern. */
export const HEADERS_FILES: Readonly<Record<HeadersKind, string>> = {
  page: 'page.headers',
  sw: 'sw.headers',
  assets: 'assets.headers',
};

export interface ParsedHeaders<E> {
  readonly entries: readonly E[];
  readonly diagnostics: readonly FileDiagnostic[];
  /** The `#` comments, for the `fud-disable` directives. */
  readonly comments: readonly SourceComment[];
}

/** A header token (RFC 9110). */
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;
/** Printable ASCII and the tab: what a header value can carry. */
const PRINTABLE = /^[\t\x20-\x7e]*$/u;

/** One file's text → its entries and what is wrong in it (the checks that need no build). */
export function parseHeaders(kind: 'assets', text: string): ParsedHeaders<AssetRule>;
export function parseHeaders(kind: 'page' | 'sw', text: string): ParsedHeaders<HeaderEntry>;
export function parseHeaders(kind: HeadersKind, text: string): ParsedHeaders<HeaderEntry | AssetRule>;
export function parseHeaders(kind: HeadersKind, text: string): ParsedHeaders<HeaderEntry | AssetRule> {
  const scan = new Scanner(kind, text);
  scan.run();
  return { entries: kind === 'assets' ? scan.rules : scan.top, diagnostics: scan.diagnostics, comments: scan.comments };
}

/** A header being read: its continuations still to come. */
interface Open {
  readonly name: string;
  readonly start: number;
  end: number;
  readonly separator: string | undefined;
}

interface Block {
  readonly pattern: string;
  readonly span: Span;
  readonly headers: HeaderEntry[];
  readonly seen: Set<string>;
  /** The indentation of its headers: the first one's. */
  indent?: number;
}

class Scanner {
  readonly top: HeaderEntry[] = [];
  readonly rules: AssetRule[] = [];
  readonly diagnostics: FileDiagnostic[] = [];
  readonly comments: SourceComment[] = [];
  private readonly file: string;
  private readonly seen = new Set<string>();
  private open: Open | undefined;
  /** Where the header being read goes when it ends: the file's list, or its block's. */
  private into: HeaderEntry[] = this.top;
  private block: Block | undefined;
  /** After a line that could not be read, its indented lines are not reported again. */
  private skipping = false;

  constructor(
    private readonly kind: HeadersKind,
    private readonly text: string,
  ) {
    this.file = HEADERS_FILES[kind];
  }

  run(): void {
    let offset = 0;
    for (const raw of this.text.split('\n')) {
      this.line(raw.replace(/\r$/u, ''), offset);
      offset += raw.length + 1;
    }
    this.close();
    this.closeBlock();
  }

  private line(line: string, offset: number): void {
    const body = line.trim();
    if (body === '') return;
    const indent = line.length - line.trimStart().length;
    const at = span(offset + indent, offset + indent + body.length);
    if (body.startsWith('#')) {
      this.comments.push({ span: at, text: body });
      return;
    }
    if (indent === 0) {
      this.close();
      this.skipping = false;
      if (this.kind === 'assets') this.columnZeroOfAssets(body, at);
      else if (body.startsWith('/')) this.fail(FUD1540({ file: this.file, span: at, problem: 'path' }));
      else this.header(body, at, this.top, this.seen);
      return;
    }
    if (this.kind === 'assets' && this.block !== undefined) {
      this.block.indent ??= indent;
      if (indent <= this.block.indent) {
        this.close();
        this.skipping = false;
        this.header(body, at, this.block.headers, this.block.seen);
        return;
      }
    }
    this.continuation(at);
  }

  private columnZeroOfAssets(body: string, at: Span): void {
    this.closeBlock();
    if (!body.startsWith('/')) {
      this.fail(FUD1540({ file: this.file, span: at, problem: body.includes(':') ? 'no-path' : 'line' }));
      return;
    }
    this.block = { pattern: body, span: at, headers: [], seen: new Set() };
    if (FUDIC_PATHS.includes(body)) this.diagnostics.push(FUD1542({ file: this.file, span: at, name: body, problem: 'path' }));
  }

  private continuation(at: Span): void {
    if (this.skipping) return;
    if (this.open === undefined) {
      this.fail(FUD1540({ file: this.file, span: at, problem: this.kind === 'assets' ? 'no-path' : 'line' }));
    } else if (this.open.separator === undefined) {
      this.diagnostics.push(FUD1540({ file: this.file, span: at, problem: 'continuation', name: this.open.name }));
    } else {
      this.open.end = at.end;
    }
  }

  private header(body: string, at: Span, into: HeaderEntry[], seen: Set<string>): void {
    const colon = body.indexOf(':');
    if (colon <= 0) {
      this.fail(FUD1540({ file: this.file, span: at, problem: 'line' }));
      return;
    }
    const name = body.slice(0, colon);
    const nameAt = span(at.start, at.start + colon);
    const lower = name.toLowerCase();
    const problem = !PRINTABLE.test(name) ? 'ascii' : !TOKEN.test(name) ? 'token' : seen.has(lower) ? 'repeated' : undefined;
    if (problem !== undefined) {
      this.fail(FUD1541({ file: this.file, span: nameAt, name, problem }));
      return;
    }
    seen.add(lower);
    this.open = { name, start: at.start, end: at.end, separator: KNOWN_HEADERS.get(lower)?.separator };
    this.into = into;
  }

  /** Ends the header being read: joins it, and checks it. */
  private close(): void {
    const open = this.open;
    if (open === undefined) return;
    this.open = undefined;
    const draft: HeaderEntry = { name: open.name, value: '', span: span(open.start, open.end) };
    const segments = segmentsOf(this.text, draft);
    const nameSpan = nameSpanOf(draft);
    const outside = segments.find((s) => !PRINTABLE.test(s.text));
    if (outside !== undefined) {
      this.diagnostics.push(FUD1541({ file: this.file, span: outside.span, name: open.name, problem: 'ascii' }));
      return;
    }
    const entry: HeaderEntry = { ...draft, value: segments.map((s) => s.text).join(open.separator ?? '') };
    if (entry.value === '' && this.kind !== 'assets') {
      this.diagnostics.push(FUD1543({ file: this.file, span: nameSpan, name: open.name, value: '', expected: '' }));
      return;
    }
    this.into.push(entry);
    if (entry.value !== '') this.diagnostics.push(...this.check(entry, nameSpan, segments));
  }

  private check(entry: HeaderEntry, nameSpan: Span, segments: readonly Piece[]): readonly FileDiagnostic[] {
    const lower = entry.name.toLowerCase();
    if (FUDIC_HEADERS[this.kind].has(lower)) {
      return [FUD1542({ file: this.file, span: nameSpan, name: entry.name, problem: 'header' })];
    }
    const known = KNOWN_HEADERS.get(lower);
    const ctx = { kind: this.kind, file: this.file, entry, nameSpan, segments };
    if (known?.name === 'Content-Security-Policy') return known.check(ctx);
    const placeholders = segments.flatMap((s) => this.placeholders(s));
    return placeholders.length > 0 ? placeholders : (known?.check(ctx) ?? []);
  }

  /** `{…}` outside a CSP: never where a placeholder is filled. */
  private placeholders(segment: Piece): readonly FileDiagnostic[] {
    return [...segment.text.matchAll(/\{([^{}]*)\}/gu)].map((m) => {
      const at = span(segment.span.start + m.index, segment.span.start + m.index + m[0].length);
      const problem = !PLACEHOLDERS.includes(m[1]!) ? 'unknown' : this.kind === 'page' ? 'misplaced' : 'file';
      return FUD1546({ file: this.file, span: at, text: m[0], problem });
    });
  }

  private closeBlock(): void {
    const block = this.block;
    if (block === undefined) return;
    this.close();
    this.block = undefined;
    this.rules.push({ pattern: block.pattern, headers: block.headers, span: block.span });
  }

  private fail(diagnostic: FileDiagnostic): void {
    this.diagnostics.push(diagnostic);
    this.skipping = true;
  }
}
