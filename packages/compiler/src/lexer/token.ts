/**
 * `Token` and its taxonomy (SDD-03 §3.1). SDD-01 deliberately left this out: the
 * taxonomy depends on the parser modes, which arrive here.
 */

import type { Span } from '../types/index.js';
import type { BalancedGroup } from '../balancer/index.js';

/**
 * Kind discriminant of a Token. Contextual, NOT character-level: a start tag is
 * one `tag-open-start` token, not LT + IDENT. Balanced JS regions are single
 * opaque atoms (`explicit-expr`, `inline-code`); their JS is validated by Oxc later.
 */
export type TokenType =
  // Content
  | 'text' // literal text run in content/value position
  | 'whitespace' // insignificant whitespace (inside tags, between top-level nodes)
  // Tags
  | 'tag-open-start' // `<name`  (carries `name`)
  | 'tag-open-end' // `>` that ends a start tag
  | 'tag-self-close' // `/>` (decision 40)
  | 'tag-close' // `</name>` (carries `name`)
  // Attributes
  | 'attr-name' // attribute name, incl. leading `@`/`.` and any `:` (carries `name`)
  | 'attr-eq' // `=`
  | 'attr-quote-open' // opening quote
  | 'attr-quote-close' // closing quote
  // HTML literals emitted verbatim
  | 'html-comment' // `<!-- ... -->` (decision 48, emitted)
  | 'doctype' // `<!DOCTYPE html>` (decision 57)
  | 'cdata' // `<![CDATA[ ... ]]>` (decision 50, svg/math only — validity is semantic)
  // Razor atoms resolved lexically by the tokenizer
  | 'at-escape' // `@@` → literal `@` (decision 1)
  | 'razor-comment' // `@* ... *@` (decisions 35–37; not emitted to output, but tokenized)
  | 'explicit-expr' // `@( ... )`, OR `( ... )` after a `bus:` name prefix (decision 28.b)
  | 'inline-code' // `@{ ... }` (carries `group`)
  | 'at-trigger' // `@` before a keyword/identifier — deferred to SDD-04. Span = the `@`.
  // Block boundaries surfaced for SDD-06 (§4.3)
  | 'block-end' // a raw `}` in html mode: always closes a control body (decision 79)
  | 'switch-label' // `case` / `default` at token start, only under a switch-body marker (80)
  // Raw element body
  | 'raw-text' // opaque body of a raw element (carries `element`)
  // Sentinel
  | 'eof'; // end of input (idempotent)

export interface BaseToken {
  readonly type: TokenType;
  readonly span: Span;
}

/** `tag-open-start` / `tag-close` carry the tag name, verbatim (case as written). */
export interface NamedTagToken extends BaseToken {
  readonly type: 'tag-open-start' | 'tag-close';
  readonly name: string;
}

/** `attr-name` carries the full attribute name (leading `@`/`.` and `:` included). */
export interface AttrNameToken extends BaseToken {
  readonly type: 'attr-name';
  readonly name: string;
}

/** `explicit-expr` / `inline-code` carry the balancer result for the opaque JS region. */
export interface JsRegionToken extends BaseToken {
  readonly type: 'explicit-expr' | 'inline-code';
  readonly group: BalancedGroup;
}

/** `raw-text` carries the lowercased element name it belongs to (`script`/`style`; §4.6). */
export interface RawTextToken extends BaseToken {
  readonly type: 'raw-text';
  readonly element: string;
}

/** Tokens with no extra payload beyond type + span. */
export interface PlainToken extends BaseToken {
  readonly type: Exclude<
    TokenType,
    'tag-open-start' | 'tag-close' | 'attr-name' | 'explicit-expr' | 'inline-code' | 'raw-text'
  >;
}

export type Token = NamedTagToken | AttrNameToken | JsRegionToken | RawTextToken | PlainToken;
