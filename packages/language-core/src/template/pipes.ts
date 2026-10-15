/**
 * Pipes in the projection (SDD-58 §4.11, decision 158).
 *
 * In a view expression `a | b` is the pipe, not the OR of bits, and TypeScript only knows the
 * latter: `precio | euros` would be «the right-hand side of an arithmetic operation must be a
 * number». So the projection writes it as `$pipe(a, b)`, whose declaration in `GLOBALS_DTS`
 * checks that `b` formats an `a`.
 *
 * The two operands are copied 1:1 — hover, rename and definition keep working on them — and
 * only `$pipe(`, the comma and the `)` are scaffolding. The comma is anchored to the `|` it
 * stands for. Which `|` are pipes is a question about precedence (`ok ? p | e : x`), so it is
 * answered on the AST of the file's one batch, never on the text.
 */

import { span, type OxcNode, type Span } from '@fudic/compiler';
import { child, isNode } from '../oxc-node.js';
import type { FragmentAst } from './context.js';

/** One `a | b`, in source coordinates. */
export interface PipeSpan {
  readonly whole: Span;
  readonly left: Span;
  /** The `|` itself: what the projected comma is anchored to. */
  readonly bar: Span;
  readonly right: Span;
}

/** Map a buffer `[start, end)` of the batch back to the `.fud`. */
export type MapSpan = (start: number, end: number) => Span;

/**
 * Every pipe of a view expression's AST, outermost first: `a | p | q` is `(a | p) | q`, and the
 * outer one comes before the one inside its left operand.
 */
export function pipesOf(ast: FragmentAst | undefined, mapSpan: MapSpan, source: string): readonly PipeSpan[] {
  const out: PipeSpan[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!isNode(value)) return;
    if (value.type === 'BinaryExpression' && value['operator'] === '|') out.push(pipeOf(value, mapSpan, source));
    for (const key of Object.keys(value)) visit(value[key]);
  };
  visit(ast);
  return out;
}

function pipeOf(node: OxcNode, mapSpan: MapSpan, source: string): PipeSpan {
  // A `BinaryExpression` always has both operands; the `!` is the shape, not a guess.
  const left = mapSpan(child(node, 'left')!.start, child(node, 'left')!.end);
  const right = mapSpan(child(node, 'right')!.start, child(node, 'right')!.end);
  const bar = source.indexOf('|', left.end);
  return { whole: mapSpan(node.start, node.end), left, bar: span(bar, bar + 1), right };
}

/** The writer's half: `at` copied with every pipe inside it written as `$pipe(a, b)`. */
export interface PipeWriter {
  copy(at: Span): void;
  scaffold(text: string, anchor?: Span): void;
}

/** Copy `at`, projecting each pipe of `pipes` that lies inside it. */
export function copyPiped(w: PipeWriter, at: Span, pipes: readonly PipeSpan[]): void {
  let cursor = at.start;
  for (const pipe of pipes) {
    // Inside one already written, or not inside `at` at all.
    if (pipe.whole.start < cursor || pipe.whole.end > at.end) continue;
    w.copy(span(cursor, pipe.whole.start));
    w.scaffold('$pipe(');
    copyPiped(w, pipe.left, pipes);
    w.scaffold(', ', pipe.bar);
    copyPiped(w, pipe.right, pipes);
    w.scaffold(')');
    cursor = pipe.whole.end;
  }
  w.copy(span(cursor, at.end));
}
