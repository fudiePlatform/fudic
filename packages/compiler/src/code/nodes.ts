/**
 * The `@code` AST (SDD-08 §3). Spans, no JS parsing: SDD-08 only DELIMITS the JS chunks so
 * SDD-11 can hand each one to Oxc as an independent fragment (decision 32).
 *
 * Since SDD-60 the `@code` is browser code, all of it: a `@server` / `@client` region is
 * FUD1110, and its content is one more chunk, read as if it had no wrapper.
 */

import type { LexRegion } from '../balancer/index.js';
import type { Node, Span } from '../types/index.js';

/** `@code { … }` — one container per component (33.d is enforced in SDD-10). */
export interface CodeBlockNode extends Node {
  readonly type: 'code';
  /** The JS chunks of the body, in source order. */
  readonly parts: readonly CodePart[];
  /**
   * The opaque lexical regions — strings, templates, comments, regex — the SDD-02 balancer
   * walked over the WHOLE body while delimiting the block, in source order (BUG-30 §3).
   *
   * It is published because the block is the only place that ever holds it. A consumer that
   * must ask «is this offset code or is it text?» would otherwise have to re-lex JavaScript
   * that was already lexed one phase earlier, and a text scan without this answer turns a
   * comment into a diagnostic.
   *
   * A region nested inside a template's `${…}` is listed on its own as well as covered by the
   * template, so the spans nest; they never partially overlap.
   */
  readonly regions: readonly LexRegion[];
}

export type CodePart = NeutralJs;

/**
 * JS between the braces, cut where a retired region's wrapper was. Independent Oxc
 * fragment (32). Whitespace-only chunks are omitted. `js` equals `span`: a chunk is nothing
 * but its JS.
 */
export interface NeutralJs extends Node {
  readonly type: 'neutral-js';
  readonly js: Span;
}
