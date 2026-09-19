/**
 * The snippet AST (SDD-29 §3.1). Two nodes, both `RazorConstruct`s as far as SDD-05 is
 * concerned: it hosts them as children without inspecting them.
 *
 * They are the only nodes of this compiler with an EXPIRY DATE. A snippet is markup reuse
 * and nothing else — no host, no shadow root, no instance identity, nothing at runtime — so
 * the expansion (§4.8) replaces every `@render` with the markup it names and the two nodes
 * disappear before the semantic pass runs. Everything downstream sees markup.
 *
 * The JS they carry travels as a `Span`, opaque until Oxc validates it, which is what every
 * other construct of this compiler does with JS: a header, an argument and a default value
 * are spans, and `snippet/signature.ts` is the one place that asks Oxc what is inside them.
 */

import type { Node, Span } from '../types/index.js';
import type { HtmlContent } from '../html/index.js';

/** Every node SDD-29 produces. Assignable to SDD-05's `RazorConstruct`. */
export type SnippetNode = SnippetDeclNode | RenderCallNode;

/**
 * `@snippet name(firma) { markup }` — a top-level declaration (§4.1).
 *
 * Top-level and POSITION-FREE: the strict `<link>` → `@code` → markup order of decision 53
 * does not extend to it. Collecting declarations is one pass over the top-level nodes, and
 * the order tells neither the parser nor the language server anything.
 */
export interface SnippetDeclNode extends Node {
  readonly type: 'snippet';
  /** Empty when the name was missing or malformed (`FUD0820`). */
  readonly name: string;
  readonly nameSpan: Span;
  /** Covers the identifier only, never the leading `@` (SDD-04 convention). */
  readonly keywordSpan: Span;
  /** The parameter list, parentheses EXCLUDED: what `snippet/signature.ts` hands to Oxc. */
  readonly signature: Span;
  /** The parameter list, parentheses INCLUDED (§3.1: `signatureSpan`). */
  readonly signatureSpan: Span;
  /** The body in html mode. Same content a `@if` body holds (SDD-06). */
  readonly children: readonly HtmlContent[];
  /** The `{ … }` of the body, braces included. Empty span when the body was missing. */
  readonly bodySpan: Span;
}

/**
 * `@render (ns.)?name(args)` — an invocation (§4.7).
 *
 * The keyword is mandatory (decision 11): without it the construct is indistinguishable
 * from an implicit expression that calls a function, and the two produce different nodes.
 */
export interface RenderCallNode extends Node {
  readonly type: 'render';
  /**
   * The `<link rel="snippet" as>` namespace, when the call carries one.
   *
   * The name and its span travel as ONE optional field rather than two, because they are one
   * fact: a call either has a namespace, with a place in the source, or it does not.
   */
  readonly namespace?: { readonly name: string; readonly span: Span };
  /** Empty when the name was missing (`FUD0820`). */
  readonly name: string;
  readonly nameSpan: Span;
  readonly keywordSpan: Span;
  readonly args: readonly RenderArg[];
  /** The `( … )` of the call, parentheses included. */
  readonly argsSpan: Span;
}

export type RenderArg = PositionalArg | NamedArg;

/** A value given by position: `@render card("A")`. */
export interface PositionalArg extends Node {
  readonly type: 'positional-arg';
  /** The JS expression, trimmed of surrounding whitespace. */
  readonly value: Span;
}

/**
 * A value given by name: `@render card(variant: 'b')`.
 *
 * The separator is `:` and not `=` (decision 12): it cannot be confused with an assignment,
 * and it reads the same as the signature on the other side. An argument is nominal when it
 * OPENS with an identifier followed by `:` — which no other form does, a ternary included
 * (`x ? a : b` opens with `x` and a `?`).
 */
export interface NamedArg extends Node {
  readonly type: 'named-arg';
  readonly name: string;
  readonly nameSpan: Span;
  /** The JS expression after the `:`, trimmed. */
  readonly value: Span;
}
