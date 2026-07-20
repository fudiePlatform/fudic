/**
 * The `@code` AST (SDD-08 §3). Three spans, no JS parsing: SDD-08 only DELIMITS
 * the neutral JS chunks and the `@server` / `@client` regions so SDD-11 can hand
 * each one to Oxc as an independent fragment (decision 32).
 *
 * Region uniqueness (33.a/b), pure-neutral (33.c) and the one-per-component rule
 * (33.d) are NOT here: they are semantic (SDD-12) or document-level (SDD-10).
 */

import type { Node, Span } from '../types/index.js';

/** `@code { … }` — one container per component (33.d is enforced in SDD-10). */
export interface CodeBlockNode extends Node {
  readonly type: 'code';
  /** Neutral JS chunks and `@server`/`@client` regions, in source order (free order, 34). */
  readonly parts: readonly CodePart[];
}

export type CodePart = NeutralJs | ServerRegion | ClientRegion;

/**
 * JS between the braces / between regions. Independent Oxc fragment (32).
 * Whitespace-only chunks are omitted. Side-effect restriction (33.c) is semantic.
 * `js` equals `span`: a neutral chunk is nothing but its JS.
 */
export interface NeutralJs extends Node {
  readonly type: 'neutral-js';
  readonly js: Span;
}

/**
 * `@server { js }` (32). `@server(…)` is an error (66). Independent server Oxc
 * fragment. `span` covers the whole marker `@server { … }`, `js` only the inner.
 */
export interface ServerRegion extends Node {
  readonly type: 'server-region';
  /** Inner of the `{ … }` (to Oxc). */
  readonly js: Span;
}

/** `@client { js }` (32). Independent client Oxc fragment. No parameter (66). */
export interface ClientRegion extends Node {
  readonly type: 'client-region';
  readonly js: Span;
}
