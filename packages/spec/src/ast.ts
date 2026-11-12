/**
 * The `.fudspec` syntax tree. Every node carries a `Span` (UTF-16 offsets, `[start, end)`) over
 * the original text, and every node is read-only: the language server navigates it by offset
 * and never mutates it.
 *
 * The tree is syntax only. Whether a term exists, how many arguments it takes and of which
 * type is the validator's business, against the term module that runs it.
 */

import type { SourceDiagnostic, Span } from '@fudic/diagnostics';

/** A word with its place: a tag, a slug, a term name, a keyword. */
export interface Name {
  readonly text: string;
  readonly span: Span;
}

/** The three blocks of a criterion: `given` at most once and first, then `when` and `then` in turns. */
export type BlockKind = 'given' | 'when' | 'then';

/** An unquoted token: a number, a tag, a path, an identifier. Its type is decided later. */
export interface BareArg {
  readonly kind: 'bare';
  readonly text: string;
  readonly span: Span;
}

/** A double-quoted string. `text` is the unescaped content; `span` includes the quotes. */
export interface StringArg {
  readonly kind: 'string';
  readonly text: string;
  readonly span: Span;
  /** The content between the quotes. */
  readonly contentSpan: Span;
}

/** A step of a reference that is a tag: `fud-list`. */
export interface TagStep {
  readonly kind: 'tag';
  readonly tag: Name;
  readonly span: Span;
}

/** An accessible name, unescaped; its span includes the `~` and the quotes. */
export interface AccessibleName extends Name {
  /** `exact` for `"…"`, `contains` for `~"…"`. */
  readonly match: 'exact' | 'contains';
}

/** A step of a reference that is a role: `role:<role>`, `role:<role>/"<name>"`, `role:<role>/~"<text>"`. */
export interface RoleStep {
  readonly kind: 'role';
  readonly role: Name;
  /** Absent when the step names only the role. */
  readonly name?: AccessibleName;
  readonly span: Span;
}

export type RefStep = TagStep | RoleStep;

/**
 * A reference that is more than a tag: one `role:` step, or steps joined by `>`, each searched
 * inside the one before it — `role:row/~"Luis">role:button/"Delete"`. A lone tag is a bare
 * argument.
 */
export interface RoleArg {
  readonly kind: 'role';
  /** In order, outermost first; never empty. */
  readonly steps: readonly RefStep[];
  readonly span: Span;
}

export type Arg = BareArg | StringArg | RoleArg;

/** One line inside a block: `<term> <arg>*`. */
export interface TermLine {
  readonly kind: 'term';
  readonly name: Name;
  readonly args: readonly Arg[];
  readonly span: Span;
}

export interface Block {
  readonly kind: 'block';
  readonly block: BlockKind;
  readonly keyword: Span;
  readonly terms: readonly TermLine[];
  /** From the keyword to the end of its last term. */
  readonly span: Span;
}

export interface Criterion {
  readonly kind: 'criterion';
  readonly keyword: Span;
  /** Absent when the line is a bare `criterion`. */
  readonly slug?: Name;
  readonly blocks: readonly Block[];
  /** From the keyword to the end of its last block. */
  readonly span: Span;
}

/** What a `.fudspec` specifies: a component alone, a page by its route, or a flow between pages. */
export type HeaderKind = 'component' | 'page' | 'flow';

/** `component <tag>`, `page <route>` or `flow <name>`. */
export interface HeaderDecl {
  readonly kind: 'header';
  readonly header: HeaderKind;
  readonly keyword: Span;
  /** The tag, the route as on disk (`/blog/[slug]`) or the flow's name; absent when the line is the keyword alone. */
  readonly name?: Name;
  readonly span: Span;
}

export interface SpecFile {
  readonly kind: 'spec';
  /** The first header. Absent when the file has none. */
  readonly header?: HeaderDecl;
  readonly criteria: readonly Criterion[];
  /** Every `#` comment, from the `#` to the end of its line. */
  readonly comments: readonly Span[];
  /** The whole text. */
  readonly span: Span;
}

/** What the parser always returns: a tree, partial if the input is broken, and what is wrong. */
export interface ParseResult<T> {
  readonly value: T;
  readonly diagnostics: readonly SourceDiagnostic[];
}
