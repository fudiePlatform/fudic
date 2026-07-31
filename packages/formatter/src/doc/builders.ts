/**
 * The document IR (SDD-26 §1) and its constructors.
 *
 * This module does not know what an attribute is, what `@if` means, or that HTML exists.
 * That ignorance is the point: it is what lets the whole layout engine be tested without
 * parsing anything, and it is what keeps the markup printer from growing a second, private
 * idea of when a line is too long.
 *
 * Every node carries `breaks`, computed on construction from its children. It is the
 * propagation pass Prettier runs separately, folded into the builders: a document that
 * contains a hard break cannot be printed flat, so every ancestor must know at the moment
 * it is built rather than after a second traversal. It also keeps the IR immutable, which
 * the incremental story of the whole compiler depends on.
 */

/** A piece of document. A bare string is literal text — the common case, so it stays plain. */
export type Doc = string | DocNode;

/** What every non-text node carries: whether printing it necessarily emits a newline. */
interface DocBase {
  /** True when this node cannot be printed flat. Propagates to every ancestor. */
  readonly breaks: boolean;
}

/** An ordered sequence. */
export interface ConcatDoc extends DocBase {
  readonly kind: 'concat';
  readonly parts: readonly Doc[];
}

/**
 * Content and separators printed as tightly as the width allows: each separator breaks only
 * when what follows it would not fit. `parts` alternates content, separator, content, …
 */
export interface FillDoc extends DocBase {
  readonly kind: 'fill';
  readonly parts: readonly Doc[];
}

/** The unit of decision: printed flat if it fits on the rest of the line, broken otherwise. */
export interface GroupDoc extends DocBase {
  readonly kind: 'group';
  readonly contents: Doc;
  /** Decided at construction: explicit, or forced by contents that already break. */
  readonly shouldBreak: boolean;
}

/** One more indentation level for everything inside. */
export interface IndentDoc extends DocBase {
  readonly kind: 'indent';
  readonly contents: Doc;
}

/** A break opportunity. `soft` prints nothing when flat; `hard` always breaks. */
export interface LineDoc extends DocBase {
  readonly kind: 'line';
  readonly soft: boolean;
  readonly hard: boolean;
}

/** Prints nothing; forces every enclosing group to break. */
export interface BreakParentDoc extends DocBase {
  readonly kind: 'break-parent';
}

export type DocNode = ConcatDoc | FillDoc | GroupDoc | IndentDoc | LineDoc | BreakParentDoc;

/**
 * Whether this document necessarily emits a newline.
 *
 * A literal string counts when it already contains one: that is how an opaque region
 * (`<script>`, `<pre>`) — copied byte for byte, newlines included — forces its ancestors
 * open without needing a node type of its own.
 */
export function breaksOf(doc: Doc): boolean {
  return typeof doc === 'string' ? doc.includes('\n') : doc.breaks;
}

function anyBreaks(parts: readonly Doc[]): boolean {
  return parts.some(breaksOf);
}

/** An ordered sequence of documents. */
export function concat(parts: readonly Doc[]): ConcatDoc {
  return { kind: 'concat', parts, breaks: anyBreaks(parts) };
}

/** Content and separators, packed to the margin. `parts` alternates content and separator. */
export function fill(parts: readonly Doc[]): FillDoc {
  return { kind: 'fill', parts, breaks: anyBreaks(parts) };
}

/**
 * A group: flat if it fits, broken if it does not.
 *
 * `shouldBreak` is resolved here rather than at print time, and it absorbs the contents:
 * a group holding a hard break will break, so saying so now saves every ancestor a
 * traversal and makes the answer impossible to disagree with later.
 */
export function group(contents: Doc, options?: { readonly shouldBreak?: boolean }): GroupDoc {
  const shouldBreak = options?.shouldBreak === true || breaksOf(contents);
  return { kind: 'group', contents, shouldBreak, breaks: shouldBreak };
}

/** One more indentation level. */
export function indent(contents: Doc): IndentDoc {
  return { kind: 'indent', contents, breaks: breaksOf(contents) };
}

/** A space when flat, a newline when broken. */
export const line: LineDoc = { kind: 'line', soft: false, hard: false, breaks: false };

/** Nothing when flat, a newline when broken. */
export const softline: LineDoc = { kind: 'line', soft: true, hard: false, breaks: false };

/** Always a newline. Forces every enclosing group open. */
export const hardline: LineDoc = { kind: 'line', soft: false, hard: true, breaks: true };

/** Prints nothing, breaks everything above it. */
export const breakParent: BreakParentDoc = { kind: 'break-parent', breaks: true };

/** The empty document. */
export const empty = '';

/** `parts` with `separator` between each pair. */
export function join(separator: Doc, parts: readonly Doc[]): ConcatDoc {
  const out: Doc[] = [];
  for (const [i, part] of parts.entries()) {
    if (i > 0) out.push(separator);
    out.push(part);
  }
  return concat(out);
}
