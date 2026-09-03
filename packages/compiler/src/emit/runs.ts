/**
 * Text runs — the unit both emit branches build text with.
 *
 * A run is a maximal stretch of adjacent text and interpolation siblings. It is emitted as
 * ONE `$dom.text(...)` because that is what the browser will end up with anyway: HTML has
 * no boundary between two text nodes, so `text("a") + text("b")` serializes to `ab` and the
 * parser hands back a single node. Emitting them separately means the client's tree and the
 * server's tree stop being the same tree the moment the markup makes the round trip.
 *
 * One emitted node per run also makes the run FINDABLE: it is whatever sits between two
 * elements, so hydration reaches it from the element beside it instead of counting nodes.
 *
 * A run that carries no interpolation is never touched again — nobody rewrites static text
 * — so it needs no reference at all; the client creates it inline. Only an interpolated run
 * gets a variable.
 */

import { decodeEntities, type ElementNode, type HtmlContent } from '../html/index.js';
import type { Span } from '../types/index.js';
import type { LinePart } from './writer.js';
import { collapseSpace, type SpaceMode } from './space.js';
import { displayOfTag, isBlockContainer, isBlockLevel, type Display, type RunContext } from './display.js';
// A value from `marker.ts`, and no cycle: what that module takes from this one is a TYPE,
// erased at runtime. The closed set of control discriminants is stated once, where the other
// consumer of this item list already states it.
import { isControlNode } from './marker.js';

/** One coalesced stretch of text/interpolation siblings. */
export interface TextRun {
  readonly kind: 'run';
  /** The JS expression for the node's data, in writer parts (so anchors survive). */
  readonly value: readonly LinePart[];
  /** Whether any piece is an interpolation — i.e. whether anyone will ever rewrite it. */
  readonly interpolated: boolean;
  /**
   * Whether every piece is literal whitespace — the run BUG-21 asks to prove unnecessary.
   *
   * Read off the RAW source, before entities are decoded: `&#32;` is a space the author
   * asked for by name, and a node that spells its own content is content.
   */
  readonly blank: boolean;
}

/** Anything that is not text: an element, a control construct, a layout directive. */
export interface NodeItem {
  readonly kind: 'node';
  readonly node: HtmlContent;
}

export type EmitItem = TextRun | NodeItem;

/** What a piece of content is, seen from a text run. */
type ContentRole =
  /** Literal text the author wrote. It goes into the run as characters. */
  | 'literal'
  /** An interpolation: a hole in the run, filled at render time. */
  | 'expression'
  /** Anything else: emitted as a node of its own, or deliberately producing nothing. */
  | 'node';

/**
 * The role of every kind of content — and the reason this is a TABLE and not a `switch`.
 *
 * Its type names each member of `HtmlContent`, so a node type cannot be added to the AST
 * without this file deciding what it is. That is the invariant BUG-14 §5 adds: `at-escape`
 * was silently dropped from every output because nothing in the emit read it, and nothing
 * anywhere complained. A total table cannot leave the next one out.
 */
const ROLE: Record<HtmlContent['type'], ContentRole> = {
  text: 'literal',
  // `@@` denotes ONE literal `@` (decision 1) — the same resolution the parser already
  // applies in an attribute value, where `AttributeValuePart` has no escape node to hold.
  'at-escape': 'literal',
  'razor-expression': 'expression',
  element: 'node',
  comment: 'node',
  doctype: 'node',
  cdata: 'node',
  'raw-text': 'node',
  'style-content': 'node',
  // `@raw(…)` is an interpolation whose value is NOT escaped (decision 18). The emit has
  // no consumer for it yet — that is SDD-07's escape semantics, not BUG-14's literal text.
  'raw-expression': 'node',
  'razor-comment': 'node',
  'inline-code': 'node',
  'unhandled-construct': 'node',
  if: 'node',
  else: 'node',
  for: 'node',
  foreach: 'node',
  while: 'node',
  switch: 'node',
  code: 'node',
  'render-body': 'node',
  'render-head': 'node',
  'render-section': 'node',
  section: 'node',
};

const isTextish = (node: HtmlContent): boolean => ROLE[node.type] !== 'node';

/** Whether a piece of content is literal text — the `@@` escape included. */
export const isLiteralText = (node: HtmlContent): boolean => ROLE[node.type] === 'literal';

/**
 * Group a child list into the items an emitter walks: coalesced text runs, and everything
 * else one by one — minus the whitespace runs the context PROVES render nothing (BUG-21).
 *
 * It takes a context and not a mode because the question is no longer *«does this
 * collapse?»* — which is about the run — but *«which box does it fall in?»*, which is about
 * the parent and the neighbours. And it is decided HERE, in the module both branches walk
 * their children with, for the reason `marker.ts` is a module: a node the server paints and
 * the client does not fabricate is a tree `h()` adopts misaligned (§4.5).
 */
export function emitItems(
  source: string,
  children: readonly HtmlContent[],
  at: RunContext,
): EmitItem[] {
  const items: EmitItem[] = [];
  let run: HtmlContent[] = [];
  const flush = (): void => {
    if (run.length > 0) items.push(textRun(source, run, at.space));
    run = [];
  };
  for (const child of children) {
    if (isTextish(child)) {
      run.push(child);
      continue;
    }
    flush();
    items.push({ kind: 'node', node: child });
  }
  flush();
  return keepRuns(items, at);
}

/**
 * The rule (§4.1): **a whitespace-only run is emitted, unless the emit can PROVE it paints
 * nothing.** The burden is on discarding — every `unknown` conserves, in every question.
 *
 * The three guards go first and admit no exception (§4.4), then the three proofs (§4.2),
 * and then one last reading of the RESULT: an element whose children were all discardable
 * keeps the last one, because an element with no children is `:empty` and rules that did
 * not apply would start applying.
 */
function keepRuns(items: readonly EmitItem[], at: RunContext): EmitItem[] {
  if (at.space === 'preserve' || at.light) return [...items];
  const dropped = items.map((item, i) => item.kind === 'run' && item.blank && proven(items, i, at));
  const kept = items.filter((_, i) => !dropped[i]);
  // Discarding every child of an element is emptying it, and `:empty` can see that. Asked of
  // the RESULT and not of the source: if every sibling goes, the last one stays — and asked
  // of what ends up being a NODE, so an author comment, which neither branch paints, does not
  // pass for content.
  if (kept.some(isNode)) return kept;
  const last = dropped.lastIndexOf(true);
  if (last === -1) return kept;
  dropped[last] = false;
  return items.filter((_, i) => !dropped[i]);
}

/** Whether an item ends up as a node of the DOM — a run always does, blank or not. */
function isNode(item: EmitItem): boolean {
  return item.kind === 'run' || item.node.type === 'element' || isControlNode(item.node);
}

/** The display of the item beside a run — `unknown` for everything that is not an element. */
function neighbour(items: readonly EmitItem[], i: number, at: RunContext): Display {
  const item = items[i];
  if (item === undefined || item.kind !== 'node' || item.node.type !== 'element') return 'unknown';
  return displayOfTag((item.node as ElementNode).name, at.boxes);
}

/**
 * Whether the emit can prove this whitespace run renders nothing. Three proofs, closed, and
 * all three from the whitespace model of CSS rather than from a list of tags (§4.2).
 */
function proven(items: readonly EmitItem[], i: number, at: RunContext): boolean {
  // (a) The container generates no box for it. In a flex or grid container a whitespace-only
  // child is not collapsed — it produces no box at all — and this looks at no neighbour.
  if (at.container === 'flex') return true;
  // (b) At the start or the end of a block container. The edge of a block container is
  // always the edge of a line, and collapsible whitespace at the edge of a line is removed.
  // Being first is not enough: the body of a construct is at the container's edge only when
  // nothing of the level renders on that side, which is what `atStart` / `atEnd` carry.
  if (isBlockContainer(at.container)) {
    if (i === 0 && at.atStart) return true;
    if (i === items.length - 1 && at.atEnd) return true;
  }
  // (c) Between two block-level boxes: neither of them puts it on a line, so there is no
  // line for it to render on. It needs no condition on the container — a block-level box
  // breaks the line whatever holds it.
  return isBlockLevel(neighbour(items, i - 1, at)) && isBlockLevel(neighbour(items, i + 1, at));
}

/**
 * The characters a literal piece contributes to a run.
 *
 * `@@` is resolved HERE, and only here: the `AtEscapeNode` stays in the AST with its span,
 * which is what the LSP and the formatter read, while the emit finally gives it the one
 * character it denotes. Exported because a `<title>` is text too, built by `parts.ts`.
 */
export function literalText(node: HtmlContent): string {
  return node.type === 'at-escape' ? '@' : (node as { value: string }).value;
}

/** The `$dom.text(...)` argument for one run: a literal, a lone expression, or a template. */
function textRun(source: string, pieces: readonly HtmlContent[], space: SpaceMode): TextRun {
  const slice = (sp: Span): string => source.slice(sp.start, sp.end);
  const expr = (node: HtmlContent): Span => (node as { expr: Span }).expr;
  // Collapse FIRST, decode after: `&#32;` is a space the author asked for by name, and a
  // collapse that ran afterwards would eat it along with the formatting whitespace.
  const literal = (node: HtmlContent): string => {
    const text = literalText(node);
    return decodeEntities(space === 'preserve' ? text : collapseSpace(text));
  };
  const interpolated = pieces.some((p) => ROLE[p.type] === 'expression');
  // An interpolation is never blank whatever it evaluates to, and `@@` contributes an `@`.
  const blank = !interpolated && pieces.every((p) => BLANK.test(literalText(p)));

  // No hole anywhere: ONE string literal, however many pieces contributed to it. `@@` beside
  // its own text is still static text, and static text has no business being a template.
  if (!interpolated) {
    return { kind: 'run', value: [JSON.stringify(pieces.map(literal).join(''))], interpolated, blank };
  }

  const only = pieces[0]!;
  if (pieces.length === 1) {
    return {
      kind: 'run',
      value: ['String((', { text: slice(expr(only)), src: expr(only).start }, `) ?? '')`],
      interpolated,
      blank,
    };
  }

  // Mixed: one template literal. `?? ''` per hole keeps a nullish value from printing as
  // "null"/"undefined", exactly as the lone-expression form does.
  const parts: LinePart[] = ['`'];
  for (const piece of pieces) {
    if (ROLE[piece.type] === 'expression') {
      parts.push('${(', { text: slice(expr(piece)), src: expr(piece).start }, ") ?? ''}");
    } else {
      parts.push(literal(piece).replace(/[`\\$]/gu, '\\$&'));
    }
  }
  parts.push('`');
  return { kind: 'run', value: parts, interpolated, blank };
}

/**
 * A piece made of nothing but HTML space characters, and ONLY those. `\s` would also match
 * U+00A0 and the rest of the Unicode spaces, and a non-breaking space is content — the same
 * distinction `collapseSpace` makes, for the same reason.
 */
const BLANK = /^[ \t\n\f\r]+$/u;
