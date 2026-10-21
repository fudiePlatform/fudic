/**
 * The expression of a `require` or a `when`: field paths, literals, comparisons, `contains`,
 * `valid`/`empty`/`length`, `and`/`or`/`not` and parentheses.
 *
 * From loosest to tightest: `or`, `and`, `not`, the comparisons and `contains` (one per
 * operand, never chained), and `valid`/`empty`/`length`. So
 * `empty name or not access.key contains name` reads as
 * `(empty name) or (not (access.key contains name))`.
 *
 * It reads straight off the source, because a parenthesis may be glued to a word. The first
 * thing that does not fit is reported once (`FUD1069`) and the whole expression is dropped.
 */

import { FUD1069, span, type SourceDiagnostic, type Span } from '@fudic/diagnostics';
import type { BinaryOp, Expr, Name, PathExpr } from './ast.js';

type Kind = 'word' | 'number' | 'string' | 'op' | 'open' | 'close' | 'bad';

interface Lexeme {
  readonly kind: Kind;
  readonly text: string;
  readonly span: Span;
  /** The unescaped content of a string. */
  readonly value?: string;
}

const WORD = /[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/y;
const NUMBER = /-?\d+(?:\.\d+)?/y;
const OP = /==|!=|<=|>=|<|>/y;

function lex(source: string, start: number, end: number): Lexeme[] {
  const out: Lexeme[] = [];
  let i = start;
  const at = (re: RegExp): string | undefined => {
    re.lastIndex = i;
    const m = re.exec(source);
    return m !== null && i + m[0].length <= end ? m[0] : undefined;
  };
  while (i < end) {
    const c = source[i]!;
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    if (c === '(' || c === ')') {
      out.push({ kind: c === '(' ? 'open' : 'close', text: c, span: span(i, i + 1) });
      i++;
      continue;
    }
    if (c === '"') {
      let value = '';
      let j = i + 1;
      while (j < end && source[j] !== '"') {
        if (source[j] === '\\' && (source[j + 1] === '"' || source[j + 1] === '\\')) j++;
        value += source[j];
        j++;
      }
      // An unclosed string was reported by the line; here it ends with the expression.
      const close = Math.min(j + 1, end);
      out.push({ kind: 'string', text: source.slice(i, close), span: span(i, close), value });
      i = close;
      continue;
    }
    const [kind, text] = lexeme(at);
    const taken = text ?? c;
    out.push({ kind, text: taken, span: span(i, i + taken.length) });
    i += taken.length;
  }
  return out;
}

/** The kind and text of the lexeme `at` finds where the cursor is; `bad` with none. */
function lexeme(at: (re: RegExp) => string | undefined): readonly [Kind, string | undefined] {
  const number = at(NUMBER);
  if (number !== undefined) return ['number', number];
  const word = at(WORD);
  if (word !== undefined) return ['word', word];
  const op = at(OP);
  return op !== undefined ? ['op', op] : ['bad', undefined];
}

const COMPARISON = new Set(['==', '!=', '<', '<=', '>', '>=', 'contains']);
const CALLS = new Set(['valid', 'empty', 'length']);
const KEYWORDS = new Set(['and', 'or', 'not', 'contains', 'valid', 'empty', 'length', 'true', 'false']);

/** Thrown inside the parser only, and caught at its entry: the lexeme it stopped at. */
class Stop {
  constructor(readonly at: Lexeme | undefined) {}
}

/** The expression in `source[start, end)`, or `undefined` having reported why not. */
export function parseExpr(source: string, start: number, end: number, out: SourceDiagnostic[]): Expr | undefined {
  const lexemes = lex(source, start, end);
  let i = 0;
  const peek = (): Lexeme | undefined => lexemes[i];
  const next = (): Lexeme => {
    const l = lexemes[i];
    if (l === undefined || l.kind === 'bad') throw new Stop(l);
    i++;
    return l;
  };
  const isWord = (l: Lexeme | undefined, text: string): boolean => l?.kind === 'word' && l.text === text;

  const binary = (op: BinaryOp, opSpan: Span, left: Expr, right: Expr): Expr => ({
    kind: 'binary',
    op,
    opSpan,
    left,
    right,
    span: span(left.span.start, right.span.end),
  });

  const or = (): Expr => {
    let left = and();
    while (isWord(peek(), 'or')) {
      const op = next();
      left = binary('or', op.span, left, and());
    }
    return left;
  };
  const and = (): Expr => {
    let left = not();
    while (isWord(peek(), 'and')) {
      const op = next();
      left = binary('and', op.span, left, not());
    }
    return left;
  };
  const not = (): Expr => {
    if (!isWord(peek(), 'not')) return comparison();
    const keyword = next();
    const operand = not();
    return { kind: 'not', keyword: keyword.span, operand, span: span(keyword.span.start, operand.span.end) };
  };
  const comparison = (): Expr => {
    const left = unary();
    const op = peek();
    if (op === undefined || !COMPARISON.has(op.text)) return left;
    next();
    return binary(op.text as BinaryOp, op.span, left, unary());
  };
  const unary = (): Expr => {
    const l = peek();
    if (l !== undefined && l.kind === 'word' && CALLS.has(l.text)) {
      next();
      const arg = path(next());
      return { kind: 'call', fn: { text: l.text, span: l.span }, arg, span: span(l.span.start, arg.span.end) };
    }
    return primary();
  };
  const primary = (): Expr => {
    const l = next();
    if (l.kind === 'open') {
      const inner = or();
      const close = next();
      if (close.kind !== 'close') throw new Stop(close);
      return { kind: 'group', inner, span: span(l.span.start, close.span.end) };
    }
    if (l.kind === 'number') {
      return { kind: 'literal', literal: { kind: 'number', value: Number(l.text), span: l.span }, span: l.span };
    }
    if (l.kind === 'string') {
      return { kind: 'literal', literal: { kind: 'string', text: l.value!, span: l.span }, span: l.span };
    }
    if (l.text === 'true' || l.text === 'false') {
      return { kind: 'literal', literal: { kind: 'bool', value: l.text === 'true', span: l.span }, span: l.span };
    }
    return path(l);
  };
  const path = (l: Lexeme): PathExpr => {
    if (l.kind !== 'word' || KEYWORDS.has(l.text)) throw new Stop(l);
    const segments: Name[] = [];
    let at = l.span.start;
    for (const text of l.text.split('.')) {
      segments.push({ text, span: span(at, at + text.length) });
      at += text.length + 1;
    }
    return { kind: 'path', segments, span: l.span };
  };

  try {
    const expr = or();
    if (i < lexemes.length) throw new Stop(lexemes[i]);
    return expr;
  } catch (e) {
    const at = (e as Stop).at;
    out.push(FUD1069({ span: at?.span ?? span(end, end), near: at?.text ?? 'end of line' }));
    return undefined;
  }
}
