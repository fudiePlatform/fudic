/**
 * The HTML AST (SDD-05 §3). Structure only: what is nested in what, which tag
 * opens and closes each element, how attributes and content group. The MEANING of
 * an attribute (event / property / ref / class: / style:) is SDD-07's, the control
 * bodies are SDD-06/08's, and the document rules are SDD-10's.
 */

import type { Node, Span } from '../types/index.js';
import type { BalancedGroup } from '../balancer/index.js';
import type {
  AtEscapeNode,
  ControlKeyword,
  RazorCommentNode,
  RazorExpression,
} from '../at/index.js';
import type { StyleNode } from '../css/index.js';

/** decision 51: file starting with `<!DOCTYPE` => page; else component. */
export type DocumentMode = 'page' | 'component';

/** Active element namespace (decision 41.b). svg/math are case-sensitive, self-close is free. */
export type Namespace = 'html' | 'svg' | 'math';

/** How an element was written / must be closed. */
export type ElementKind =
  | 'normal' //        <name>...</name>
  | 'void' //          <br>, <img>, ... (decision 39): no close tag
  | 'self-closing' //  <name/> (decision 40): empty, rewritten at emit
  | 'raw'; //          <script>...</script> (decision 43): opaque body

/** Root of a parsed .fud tree. `mode` is auto-detected (decision 51). */
export interface HtmlDocument extends Node {
  readonly type: 'document';
  readonly mode: DocumentMode;
  readonly children: readonly HtmlContent[];
}

/** An HTML element. Structure only — binding meaning of attributes is SDD-07. */
export interface ElementNode extends Node {
  readonly type: 'element';
  /** Tag name verbatim, case as written (decision 41; svg/math case-sensitive, 41.b). */
  readonly name: string;
  readonly namespace: Namespace;
  readonly kind: ElementKind;
  /** Source order preserved (decision 47). Duplicate detection is semantic (45 -> SDD-12). */
  readonly attributes: readonly Attribute[];
  /** Empty for void/self-closing; a single RawTextNode for `raw`. */
  readonly children: readonly HtmlContent[];
  /** `<name ...>` / `<name .../>` — the whole start tag. */
  readonly openSpan: Span;
  /** `</name>` — absent for void, self-closing, or an element left unclosed at recovery. */
  readonly closeSpan?: Span;
}

/**
 * A syntactic attribute: verbatim name + ordered value parts. SDD-05 does NOT classify it
 * (event/property/ref/class:/style: is decision 22-30 -> SDD-07); it carries the raw name.
 */
export interface Attribute extends Node {
  readonly type: 'attribute';
  /**
   * Attribute name. Usually a verbatim `string` incl. leading `@`/`.` and any `:`
   * (decisions 29, 46), incl. the reserved `bus:` prefix. For the `bus:(expr)="@h"` form
   * (decision 28.b) the name is a `RazorExpression`. SDD-05 stays structural; SDD-07
   * classifies `bus:` => BusBinding, and SDD-12 resolves it (decision 28.c).
   */
  readonly name: string | RazorExpression;
  /** Ordered parts. Empty array => boolean OR empty value: `x` = `x=""` (decision 44). */
  readonly value: readonly AttributeValuePart[];
}

export type AttributeValuePart = AttributeText | RazorExpression;

/** A literal run inside a quoted attribute value. Verbatim (entities pass-through, decision 49). */
export interface AttributeText extends Node {
  readonly type: 'attribute-text';
  readonly value: string;
}

/** Literal text run. Verbatim: no entity decoding/re-escaping (decision 49). */
export interface TextNode extends Node {
  readonly type: 'text';
  readonly value: string;
}

/** `<!-- ... -->`. Emitted to output as a DOM comment (decision 48). `value` = inner text. */
export interface CommentNode extends Node {
  readonly type: 'comment';
  readonly value: string;
}

/** `<!DOCTYPE ...>`. Recognized lexically; only `<!DOCTYPE html>` is valid (57 -> SDD-10). */
export interface DoctypeNode extends Node {
  readonly type: 'doctype';
}

/** `<![CDATA[ ... ]]>`. Valid only inside svg/math (decision 50); elsewhere => FUD0054. */
export interface CdataNode extends Node {
  readonly type: 'cdata';
  readonly value: string;
}

/** Opaque body of a raw element (`<script>`, decision 43). `element` = lowercased tag name. */
export interface RawTextNode extends Node {
  readonly type: 'raw-text';
  readonly value: string;
  readonly element: string;
}

/** `@{ ... }` inline code (decision 16): opaque JS region, validated by Oxc (SDD-11). */
export interface InlineCodeNode extends Node {
  readonly type: 'inline-code';
  readonly group: BalancedGroup;
}

/**
 * `@raw( ... )` (SDD-04 `kind: 'raw'`, decision 18/option A): a content expression whose
 * interpolation is NOT escaped — SDD-07 maps it to `Interpolation { escaped: false }`.
 */
export interface RawExpressionNode extends Node {
  readonly type: 'raw-expression';
  readonly expr: RazorExpression;
}

/**
 * The closed set of construct discriminants. Derived from SDD-04's `ControlKeyword`
 * so the two cannot drift apart.
 *
 * SDD-05 §3.4 typed this as bare `string`, which silently destroyed the union: a
 * member whose `type` is `string` absorbs every other member, so `switch (node.type)`
 * over `HtmlContent` would hand `RazorConstruct` to every branch and no consumer
 * (SDD-06/07/10/12, the emit) could narrow anything. The SDD's own comment already
 * named the closed set; it just was not written into the type.
 */
export type RazorConstructType =
  | ControlKeyword
  | 'code'
  // Layout directives (SDD-21). Same contract: SDD-05 hosts them as children and never
  // inspects them beyond this discriminant; SDD-21 narrows them to its own node types.
  | 'render-body'
  | 'render-head'
  | 'render-section'
  | 'section';

/**
 * A node produced by an injected @-construct parser. Its concrete shape is narrowed
 * by the owning SDD (06/08), which extends this with its own fields; SDD-05 only
 * stores it as a child and never inspects it beyond the discriminant.
 */
export interface RazorConstruct extends Node {
  readonly type: RazorConstructType;
}

/** Degraded placeholder when a control/@code trigger is met with no injected handler (FUD0055). */
export interface UnhandledConstructNode extends Node {
  readonly type: 'unhandled-construct';
  readonly keyword: string;
}

/**
 * Any node that can appear as a child of an element or at the document top level.
 * `RazorExpression` (from SDD-04) is a bare interpolation atom; its escape / @raw /
 * primitive-only semantics (decisions 18, 19) are SDD-07's, layered over this node.
 */
export type HtmlContent =
  | ElementNode
  | TextNode
  | CommentNode
  | DoctypeNode
  | CdataNode
  | RawTextNode
  | StyleNode
  | RazorExpression
  | RawExpressionNode
  | RazorCommentNode
  | AtEscapeNode
  | InlineCodeNode
  | RazorConstruct
  | UnhandledConstructNode;

/** The closed list of void elements (decision 39): they never carry a close tag. */
export const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

/**
 * Elements whose body the lexer hands over as one opaque `raw-text` token.
 * `script` (decision 43) keeps that body verbatim as a `RawTextNode`. `style` is
 * lexically raw too, but the parser runs `parseStyle` over the body to interpolate
 * its Razor (SDD-09), so a `<style>` carries a `StyleNode` child instead.
 */
export const RAW_ELEMENTS: ReadonlySet<string> = new Set(['script', 'style']);
