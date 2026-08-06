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

import type { HtmlContent } from '../html/index.js';
import type { Span } from '../types/index.js';
import type { LinePart } from './writer.js';
import { collapseSpace, type SpaceMode } from './space.js';

/** One coalesced stretch of text/interpolation siblings. */
export interface TextRun {
  readonly kind: 'run';
  /** The JS expression for the node's data, in writer parts (so anchors survive). */
  readonly value: readonly LinePart[];
  /** Whether any piece is an interpolation — i.e. whether anyone will ever rewrite it. */
  readonly interpolated: boolean;
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
 * else one by one. `space` decides whether the literal pieces collapse (BUG-07 §4.4).
 */
export function emitItems(
  source: string,
  children: readonly HtmlContent[],
  space: SpaceMode,
): EmitItem[] {
  const items: EmitItem[] = [];
  let run: HtmlContent[] = [];
  const flush = (): void => {
    if (run.length > 0) items.push(textRun(source, run, space));
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
  return items;
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
  const literal = (node: HtmlContent): string =>
    space === 'preserve' ? literalText(node) : collapseSpace(literalText(node));
  const interpolated = pieces.some((p) => ROLE[p.type] === 'expression');

  // No hole anywhere: ONE string literal, however many pieces contributed to it. `@@` beside
  // its own text is still static text, and static text has no business being a template.
  if (!interpolated) {
    return { kind: 'run', value: [JSON.stringify(pieces.map(literal).join(''))], interpolated };
  }

  const only = pieces[0]!;
  if (pieces.length === 1) {
    return {
      kind: 'run',
      value: ['String((', { text: slice(expr(only)), src: expr(only).start }, `) ?? '')`],
      interpolated,
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
  return { kind: 'run', value: parts, interpolated };
}
