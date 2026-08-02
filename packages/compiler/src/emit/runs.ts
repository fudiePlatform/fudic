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

const isTextish = (node: HtmlContent): boolean =>
  node.type === 'text' || node.type === 'razor-expression';

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

/** The `$dom.text(...)` argument for one run: a literal, a lone expression, or a template. */
function textRun(source: string, pieces: readonly HtmlContent[], space: SpaceMode): TextRun {
  const slice = (sp: Span): string => source.slice(sp.start, sp.end);
  const expr = (node: HtmlContent): Span => (node as { expr: Span }).expr;
  const literal = (node: HtmlContent): string => (node as { value: string }).value;
  const interpolated = pieces.some((p) => p.type === 'razor-expression');

  const only = pieces[0]!;
  if (pieces.length === 1) {
    if (!interpolated) {
      const value = space === 'preserve' ? literal(only) : collapseSpace(literal(only));
      return { kind: 'run', value: [JSON.stringify(value)], interpolated };
    }
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
    if (piece.type === 'razor-expression') {
      parts.push('${(', { text: slice(expr(piece)), src: expr(piece).start }, ") ?? ''}");
    } else {
      const value = space === 'preserve' ? literal(piece) : collapseSpace(literal(piece));
      parts.push(value.replace(/[`\\$]/gu, '\\$&'));
    }
  }
  parts.push('`');
  return { kind: 'run', value: parts, interpolated };
}
