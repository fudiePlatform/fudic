/**
 * Where an offset IS (BUG-22).
 *
 * A `.fud` is three languages in one file, and until now nobody could say which one an
 * offset belonged to: the virtual emitter projects TypeScript and CSS, so "I am in HTML"
 * was whatever no projection covered — a definition by elimination, computed downstream,
 * and unavailable to the editor. The parser already knows the answer exactly; this module
 * is the question.
 *
 * It answers from the TREE, never from the text before the cursor. That is the whole
 * point: a backwards scan for a `<` with no `>` after it cannot tell `<div title="a > b"`
 * from markup, while the parser tokenized that `>` as part of a quoted value and never had
 * the doubt. The one concession to text is `attributeValueSpan`, and it reads FORWARD from
 * an attribute the parser already located.
 *
 * The one shape the tree gets wrong on its own is an unterminated start tag: `openSpan`
 * stops at the tag name when no `>` was ever read, because that is the span `FUD0052` has
 * to underline. `openTagSpan` restores what the lexer actually did — it stayed in tag mode
 * — without changing what the diagnostic points at.
 */

import type { Span } from '../types/index.js';
import { span } from '../types/index.js';
import type { RazorExpression } from '../at/index.js';
import type { Attribute, ElementNode, HtmlContent, HtmlDocument } from '../html/index.js';
import type { CodeBlockNode, CodePart } from '../code/index.js';
import type { StyleNode } from '../css/index.js';
import type { ControlNode, KeyedNode } from '../control/index.js';
import type { SectionNode } from '../layout/index.js';

/**
 * The six things an offset can be inside.
 *
 * `tag` and `attr-value` are both "inside a start tag", split because the answer differs:
 * inside the tag a name is an attribute, inside the quotes it is somebody else's string.
 * `expression` is Razor's JS wherever it appears — markup, attribute value, control header
 * or `<style>` — while `ts` is a whole block of it (`@code`, `@server`, `@client`, `@{ }`).
 */
export type RegionKind = 'markup' | 'tag' | 'attr-value' | 'expression' | 'ts' | 'css';

/** What sits at an offset, and the stretch of source that answer covers. */
export interface Region {
  readonly kind: RegionKind;
  /** The stretch the answer holds for: the tag, the value, the expression, the block. */
  readonly span: Span;
  /** The element that owns the region, when one does. */
  readonly element?: ElementNode;
  /** The attribute under the offset, for `tag` and `attr-value`. */
  readonly attribute?: Attribute;
}

/** Half-open: the offset just past a node belongs to whatever comes next, not to it. */
function contains(at: Span, offset: number): boolean {
  return offset >= at.start && offset < at.end;
}

/**
 * Strictly between the delimiters of a tag — both boundaries excluded, unlike everything else.
 *
 * A caret sits BETWEEN two characters, and both of a tag's boundaries are a wall the caret can
 * stand outside of: before the `<` the author is in content and about to open an element, and
 * past the `>` the content has begun. Emmet has to work in both places, which is exactly what
 * half-open containment would take away — it would call the position just before `<p>` a tag.
 */
function insideTag(at: Span, offset: number): boolean {
  return offset > at.start && offset < at.end;
}

/**
 * Inside a stretch of JavaScript, END INCLUDED.
 *
 * The end of a control header is where the caret spends most of its life: `@if (used|)` is
 * the position the author types the condition from, and it is the last offset of the header
 * rather than a position past it. Half-open containment would hand that one back as markup —
 * and then three voices that have no business there (tags, snippets, Emmet) would answer over
 * TypeScript's.
 */
function insideJs(at: Span, offset: number): boolean {
  return offset >= at.start && offset <= at.end;
}

/**
 * The value of an attribute, inside the quotes.
 *
 * Derived from the attribute's own span rather than from its value parts, because the case
 * that matters most has none: `href=""` is where completion is asked for, and an empty parts
 * list cannot say where the quotes were.
 */
export function attributeValueSpan(source: string, attribute: Attribute): Span | undefined {
  const raw = source.slice(attribute.span.start, attribute.span.end);
  const equals = raw.indexOf('=');
  if (equals === -1) return undefined;

  const afterEquals = attribute.span.start + equals + 1;
  const quote = /^\s*(["'])/.exec(raw.slice(equals + 1));
  if (quote === null) return span(afterEquals, attribute.span.end);

  const start = afterEquals + quote[0].length;
  const closed = source[attribute.span.end - 1] === quote[1];
  return span(start, closed ? attribute.span.end - 1 : attribute.span.end);
}

/** A start tag, and whether a `>` ever closed it. */
interface OpenTag {
  readonly span: Span;
  readonly terminated: boolean;
}

/**
 * The start tag as the LEXER saw it.
 *
 * With a `>` that is `openSpan` verbatim. Without one the lexer never left tag mode — it only
 * leaves it on a `>` or at EOF — so the element has no children and everything up to where
 * recovery stopped is still inside the tag. That is exactly the stretch an editor is asked
 * about while the tag is half typed, and `terminated` is what lets the caret sitting at its
 * very end count as inside: an unterminated tag has no end yet.
 */
function openTag(source: string, element: ElementNode): OpenTag {
  return source[element.openSpan.end - 1] === '>'
    ? { span: element.openSpan, terminated: true }
    : { span: span(element.openSpan.start, element.span.end), terminated: false };
}

/**
 * The child an offset belongs to.
 *
 * Two passes, and the second is the caret at the end of the file. Containment is half-open —
 * the position just past a node belongs to whatever comes next — but at the end of what has
 * been typed there is no "next", and answering `undefined` there would make the module useless
 * in the one place an editor asks from most: the end of the line being written.
 */
function childAt(children: readonly HtmlContent[], offset: number): HtmlContent | undefined {
  for (const child of children) {
    if (contains(child.span, offset)) return child;
  }
  for (const child of children) {
    if (offset === child.span.end) return child;
  }
  return undefined;
}

/** The child that contains the offset, resolved. */
function childRegion(
  source: string,
  children: readonly HtmlContent[],
  offset: number,
): Region | undefined {
  const child = childAt(children, offset);
  return child === undefined ? undefined : nodeRegion(source, child, offset);
}

/** An expression node the offset falls in, or nothing. */
function expressionRegion(expr: RazorExpression | undefined, offset: number): Region | undefined {
  if (expr === undefined || !contains(expr.span, offset)) return undefined;
  return { kind: 'expression', span: expr.span };
}

/** Inside a quoted value: a Razor atom answers for itself, the literal runs do not. */
function attributeValueRegion(
  attribute: Attribute,
  value: Span,
  element: ElementNode,
  offset: number,
): Region {
  for (const part of attribute.value) {
    if (part.type === 'razor-expression' && contains(part.span, offset)) {
      return { kind: 'expression', span: part.span };
    }
  }
  return { kind: 'attr-value', span: value, element, attribute };
}

/** Inside a start tag: the quotes first, then the attribute the offset sits on. */
function tagRegion(
  source: string,
  element: ElementNode,
  open: Span,
  offset: number,
): Region {
  for (const attribute of element.attributes) {
    // `bus:(EVENTOS.x)` names the event with an expression (decision 28.b).
    if (typeof attribute.name !== 'string') {
      const named = expressionRegion(attribute.name, offset);
      if (named !== undefined) return named;
    }

    const value = attributeValueSpan(source, attribute);
    if (value !== undefined && offset >= value.start && offset <= value.end) {
      return attributeValueRegion(attribute, value, element, offset);
    }
    if (contains(attribute.span, offset)) {
      return { kind: 'tag', span: open, element, attribute };
    }
  }
  return { kind: 'tag', span: open, element };
}

function elementRegion(source: string, element: ElementNode, offset: number): Region {
  const open = openTag(source, element);
  if (insideTag(open.span, offset)) return tagRegion(source, element, open.span, offset);

  const inner = childRegion(source, element.children, offset);
  if (inner !== undefined) return inner;

  if (element.closeSpan !== undefined && insideTag(element.closeSpan, offset)) {
    return { kind: 'tag', span: element.closeSpan, element };
  }
  // The caret at the very end of a tag nobody closed: still inside it.
  if (!open.terminated && offset === open.span.end) {
    return tagRegion(source, element, open.span, offset);
  }
  return { kind: 'markup', span: element.span, element };
}

/** `@code { … }`: every part of it is TypeScript, the regions included. */
function codeRegion(node: CodeBlockNode, offset: number): Region {
  for (const part of node.parts as readonly CodePart[]) {
    if (contains(part.span, offset)) return { kind: 'ts', span: part.js };
  }
  return { kind: 'ts', span: node.span };
}

/** A `<style>` body: literal CSS with Razor atoms interleaved (SDD-09). */
function styleRegion(node: StyleNode, offset: number): Region {
  for (const part of node.parts) {
    if (part.type === 'razor-expression' && contains(part.span, offset)) {
      return { kind: 'expression', span: part.span };
    }
  }
  return { kind: 'css', span: node.span };
}

/** The `key (…)` clause of any control construct (decisions 91–93). */
function keyRegion(node: KeyedNode, offset: number): Region | undefined {
  return expressionRegion(node.key, offset);
}

/** A control construct: the header and the key are JS, the bodies are markup. */
function controlRegion(source: string, node: ControlNode, offset: number): Region | undefined {
  const key = keyRegion(node, offset);
  if (key !== undefined) return key;

  if (node.type === 'switch') {
    if (insideJs(node.header.inner, offset)) return { kind: 'expression', span: node.header.inner };
    for (const branch of node.cases) {
      if (branch.test !== undefined && insideJs(branch.test, offset)) {
        return { kind: 'expression', span: branch.test };
      }
      const body = childRegion(source, branch.body, offset);
      if (body !== undefined) return body;
    }
    return undefined;
  }

  if (node.type === 'if') {
    for (const branch of node.branches) {
      if (insideJs(branch.header.inner, offset)) {
        return { kind: 'expression', span: branch.header.inner };
      }
      const body = childRegion(source, branch.body, offset);
      if (body !== undefined) return body;
    }
    return childRegion(source, node.elseBody ?? [], offset);
  }

  if (insideJs(node.header.inner, offset)) return { kind: 'expression', span: node.header.inner };
  return childRegion(source, node.body, offset);
}

/** Whether a construct node is one of the five control constructs. */
function isControl(node: HtmlContent): node is ControlNode {
  return (
    node.type === 'if' ||
    node.type === 'for' ||
    node.type === 'foreach' ||
    node.type === 'while' ||
    node.type === 'switch'
  );
}

function nodeRegion(source: string, node: HtmlContent, offset: number): Region | undefined {
  if (isControl(node)) return controlRegion(source, node, offset);

  switch (node.type) {
    case 'element':
      return elementRegion(source, node, offset);
    case 'style-content':
      return styleRegion(node, offset);
    // The `@` itself stays markup, and that is not a detail: a half-written `@fore` parses as
    // an implicit expression, so claiming the boundary would call the very position where a
    // directive is being typed an expression. The `@` is where the construct BEGINS.
    case 'razor-expression':
      return offset === node.span.start ? undefined : { kind: 'expression', span: node.span };
    case 'raw-expression':
      return offset === node.span.start ? undefined : { kind: 'expression', span: node.expr.span };
    case 'inline-code':
      return { kind: 'ts', span: node.group.inner };
    case 'code':
      return codeRegion(node as CodeBlockNode, offset);
    // `<script>` is opaque to the compiler (decision 43) and JavaScript to an editor.
    case 'raw-text':
      return { kind: 'ts', span: node.span };
    case 'section':
      return childRegion(source, (node as SectionNode).children, offset);
    // Text, comments, doctype, CDATA, `@@`, `@* *@` and the layout markers are all markup:
    // they carry no second language, so the element around them owns the answer.
    default:
      return undefined;
  }
}

/**
 * The region an offset falls in.
 *
 * Always answers: a `.fud` that parsed to nothing is still markup, which is what an empty
 * file is when the user starts typing into it.
 */
export function regionAt(source: string, document: HtmlDocument, offset: number): Region {
  return childRegion(source, document.children, offset) ?? { kind: 'markup', span: document.span };
}

/**
 * The close tag the `>` just typed at `offset` is asking for, or nothing (BUG-22).
 *
 * Every editor closes `<div>` into `<div></div>`, and a `.fud` did not, because the rule needs
 * three things no editor can know about this language: which `>` ends a start tag (the one in
 * `title="a > b"` does not), which elements are allowed a close tag at all, and whether the
 * author has already written it further down.
 *
 * All three are one question to the tree. The offset just before the `>` is inside the start
 * tag by construction, so `regionAt` names both the element and the case that must be refused:
 * a `>` inside a quoted value answers `attr-value`, and nothing is inserted.
 *
 * Void and self-closing elements have no close tag (decisions 39, 40). Raw elements do —
 * `<style>` and `<script>` are the two an author most wants closed for them.
 */
export function closingTagAt(
  source: string,
  document: HtmlDocument,
  offset: number,
): string | undefined {
  if (source[offset - 1] !== '>') return undefined;

  const region = regionAt(source, document, offset - 1);
  const element = region.element;
  if (region.kind !== 'tag' || element === undefined) return undefined;

  // The `>` of THIS element's start tag, not of an ancestor's and not of its close tag.
  if (element.openSpan.end !== offset) return undefined;
  if (element.kind !== 'normal' && element.kind !== 'raw') return undefined;
  // Already closed: re-typing the `>` of a well-formed element must not double it.
  if (element.closeSpan !== undefined) return undefined;

  return `</${element.name}>`;
}
