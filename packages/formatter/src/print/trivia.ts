/**
 * The two positions where a Razor comment has no node, rescued by span (SDD-26 §2).
 *
 * `@* … *@` IS an AST node in HTML content and inside `<style>`. It is not one in the two
 * places the parser treats as trivia: between the `}` of a branch and its `else`
 * (`skipTrivia`, decision 10), and inside a `@switch` — between the `{` and the first label,
 * and between labels.
 *
 * The formatter does not need the parser changed for that. It holds the whole source and
 * the spans of the pieces on either side, so it cuts the hole between them and reprints
 * whatever comment it finds. Cutting by span is not an implementation detail: it is the
 * only reason that code is not lost, which is what acceptance criterion 7 measures.
 *
 * Reprinting a comment can add whitespace that was not there. That is not a run the
 * invariant protects: a Razor comment is never emitted (decision 37), and neither is
 * anything else in these two holes — they hold `{`, `}`, `else` and `case`, and no text
 * node reaches the output from them.
 */

import { concat, join, type Doc } from '../doc/index.js';
import { gapDoc, gapOf } from '../space/index.js';

const RAZOR_COMMENT = /@\*[\s\S]*?\*@/g;
const WHITESPACE = /\s/;

/** Every `@* … *@` in a stretch of source, in order. */
export function rescueComments(source: string, start: number, end: number): readonly string[] {
  return [...source.slice(start, end).matchAll(RAZOR_COMMENT)].map((m) => m[0]);
}

/**
 * The hole between a `}` and its `else`, as a document.
 *
 * The shape is prescribed — `} else {` — so the run there is not read at all: what has to
 * survive is the comment, and only the comment.
 */
export function printComments(source: string, start: number, end: number): Doc {
  const comments = rescueComments(source, start, end);
  return comments.length === 0 ? ' ' : concat([' ', join(' ', comments), ' ']);
}

/** The stretch of whitespace that ends at `at`. */
function whitespaceEndingAt(source: string, at: number): string {
  let start = at;
  while (start > 0 && WHITESPACE.test(source[start - 1]!)) start -= 1;
  return source.slice(start, at);
}

/**
 * The run that precedes a piece of `@switch` scaffolding, plus any comment between it and
 * the piece before.
 *
 * The run is read BACKWARDS from the scaffolding rather than forwards from what came
 * before, because a case's span already swallows the whitespace that follows its body:
 * looking forwards finds an empty hole and puts the next label on the previous line.
 *
 * A comment is printed with a space on either side. That is whitespace the source may not
 * have had, and it is not a run the invariant protects: a Razor comment is never emitted
 * (decision 37), and neither is anything else in these holes — they hold `{`, `}` and
 * `case`, and no text node reaches the output from them.
 */
export function printGapBefore(source: string, from: number, at: number): Doc {
  const comments = rescueComments(source, from, at);
  const gap = gapOf(whitespaceEndingAt(source, at));
  const space = gapDoc(gap, { breakable: true, edge: false });
  if (comments.length === 0) return space;
  return concat([' ', join(' ', comments), gap.present ? space : ' ']);
}
