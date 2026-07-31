/**
 * Whitespace runs — the invariant the whole formatter rests on.
 *
 * > The printer never creates nor destroys a whitespace run in HTML content.
 * > It only rewrites its contents.
 *
 * That single rule is what makes the rendered document provably unchanged, and it is
 * stronger than the case-by-case reasoning of §4.5. HTML collapses a run of whitespace to
 * one space wherever whitespace is significant, so rewriting a run — two spaces into one, a
 * space into a newline, a newline into two — is invisible. What is not invisible is a run
 * appearing where there was none, or vanishing where there was one. `@data.tag</app-badge>`
 * cannot acquire a break because there is no run there to rewrite; nothing about inline
 * elements has to be consulted to know it.
 *
 * It is also what makes acceptance criterion 3 checkable without asking the display table
 * anything, which is the only way that test is not circular.
 */

import { concat, hardline, line, type Doc } from '../doc/index.js';
import type { HtmlContent, TextNode } from '@fudic/compiler';

/** One stretch of whitespace between two pieces of content. */
export interface Gap {
  /** Whether there is a run at all. `false` is the one thing the printer may not change. */
  readonly present: boolean;
  /** Whether the run contains a newline: the author put these two pieces on separate lines. */
  readonly hasNewline: boolean;
  /** Whether the run contains a blank line. Collapsed to at most one (§4.5). */
  readonly hasBlankLine: boolean;
}

/** No whitespace at all. The one gap that must come out the other side unchanged. */
export const NO_GAP: Gap = { present: false, hasNewline: false, hasBlankLine: false };

/** Read a stretch of source whitespace. */
export function gapOf(text: string): Gap {
  if (text === '') return NO_GAP;
  const newlines = text.split('\n').length - 1;
  return { present: true, hasNewline: newlines > 0, hasBlankLine: newlines > 1 };
}

/** Where this gap sits, which is what decides whether a blank line may survive it. */
export interface GapContext {
  /** May the printer turn a run with no newline into a break? False inside inline content. */
  readonly breakable: boolean;
  /** True at the very start or end of a block: blank lines are removed there (§4.5). */
  readonly edge: boolean;
}

/**
 * Print a gap.
 *
 * The order of the cases is the invariant, read top to bottom: absent stays absent; a blank
 * line survives as exactly one; a newline stays a newline; a plain run becomes a break
 * opportunity where that is allowed, and a single space where it is not.
 */
export function gapDoc(gap: Gap, context: GapContext): Doc {
  if (!gap.present) return '';
  if (gap.hasBlankLine && !context.edge) return concat([hardline, hardline]);
  if (gap.hasNewline) return hardline;
  return context.breakable ? line : ' ';
}

/** A piece of content: a node, or one word of a text node. */
export type Item =
  | { readonly kind: 'node'; readonly node: HtmlContent }
  | { readonly kind: 'word'; readonly text: string };

/**
 * A list of children, read as content separated by runs.
 *
 * `gaps[i]` sits between `items[i]` and `items[i + 1]`, so the two arrays together tile the
 * source exactly — which is what lets the invariant be checked by counting rather than by
 * reasoning about who is inline.
 */
export interface ContentSequence {
  readonly leading: Gap;
  readonly items: readonly Item[];
  readonly gaps: readonly Gap[];
  readonly trailing: Gap;
}

const isText = (node: HtmlContent): node is TextNode => node.type === 'text';

/** Split a list of children into items and the runs between them. */
export function sequenceOf(nodes: readonly HtmlContent[]): ContentSequence {
  const items: Item[] = [];
  const gaps: Gap[] = [];
  let leading = NO_GAP;
  // The run seen since the last item. It becomes a gap when the next item shows up, and the
  // trailing gap when none does.
  let pending = '';

  const push = (item: Item): void => {
    if (items.length === 0) leading = gapOf(pending);
    else gaps.push(gapOf(pending));
    pending = '';
    items.push(item);
  };

  for (const node of nodes) {
    if (!isText(node)) {
      push({ kind: 'node', node });
      continue;
    }
    // A text node contributes words, and its own whitespace to the runs on either side.
    const parts = node.value.split(/(\s+)/);
    for (const part of parts) {
      if (part === '') continue;
      if (/^\s+$/.test(part)) pending += part;
      else push({ kind: 'word', text: part });
    }
  }

  return { leading, items, gaps, trailing: gapOf(pending) };
}
