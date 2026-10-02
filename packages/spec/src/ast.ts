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

/** The three blocks of a criterion, in the only order they may appear. */
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

/** `role:<role>` or `role:<role>/"<name>"`: an element by its role and accessible name. */
export interface RoleArg {
  readonly kind: 'role';
  readonly role: Name;
  /**
   * The accessible name, unescaped; its span includes the quotes. Absent when the reference
   * names only the role.
   */
  readonly name?: Name;
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

export interface ComponentDecl {
  readonly kind: 'component';
  readonly keyword: Span;
  /** Absent when the line is a bare `component`. */
  readonly tag?: Name;
  readonly span: Span;
}

export interface SpecFile {
  readonly kind: 'spec';
  /** The first declaration. Absent when the file has none. */
  readonly component?: ComponentDecl;
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
