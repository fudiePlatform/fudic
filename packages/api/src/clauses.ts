/**
 * What every declaration builder shares: the context it reports into, names with their shape,
 * the lines a parent does not take, and the clauses several declarations have — `use`, `skip`,
 * `compress`, `fails` and a typed field.
 */

import {
  FUD1063,
  FUD1064,
  FUD1065,
  FUD1070,
  FUD1071,
  FUD1075,
  FUD1324,
  span,
  type FUD1070Shape,
  type SourceDiagnostic,
  type Span,
} from '@fudic/diagnostics';
import type {
  CompressClause,
  FailsClause,
  MiddlewareArg,
  MiddlewareRef,
  Name,
  SkipClause,
  TypedField,
  UseClause,
} from './ast.js';
import type { LineNode, Token } from './line.js';
import { cover, literal, readType, stringLiteral, wholeNumber } from './type.js';

/** What a builder reads from and reports into. */
export interface Ctx {
  readonly source: string;
  readonly out: SourceDiagnostic[];
}

export const name = (t: Token): Name => ({ text: t.raw, span: t.span });

const SHAPES: Readonly<Record<FUD1070Shape, RegExp>> = {
  kebab: /^[a-z][a-z0-9-]*$/u,
  identifier: /^[A-Za-z_][A-Za-z0-9_]*$/u,
  pascal: /^[A-Z][A-Za-z0-9]*$/u,
};

/** Whether a token has the shape of a name of that class. */
export const isShape = (t: Token, shape: FUD1070Shape): boolean => SHAPES[shape].test(t.raw);

/** `t` as a name of class `what`, reported (`FUD1070`) but kept when its shape is wrong. */
export function shaped(t: Token, shape: FUD1070Shape, what: string, c: Ctx): Name {
  if (!isShape(t, shape)) c.out.push(FUD1070({ span: t.span, name: t.raw, what, shape }));
  return name(t);
}

/** The name after the keyword of `node`, or `undefined` having reported it missing (`FUD1063`). */
export function declName(node: LineNode, shape: FUD1070Shape, what: string, c: Ctx): Name | undefined {
  const t = node.tokens[1];
  if (t === undefined) {
    c.out.push(FUD1063({ span: node.tokens[0]!.span, keyword: node.tokens[0]!.raw }));
    return undefined;
  }
  return shaped(t, shape, what, c);
}

/** Reports the tokens of `node` from `from` on as left over (`FUD1064`). */
export function trailing(node: LineNode, from: number, c: Ctx): void {
  const rest = node.tokens.slice(from);
  if (rest.length > 0) c.out.push(FUD1064({ span: cover(rest), text: rest.map((t) => t.raw).join(' ') }));
}

/** How a parent is named in a message: its first two words. */
const label = (parent: LineNode): string =>
  parent.tokens
    .slice(0, 2)
    .map((t) => t.raw)
    .join(' ');

/** A line `parent` does not take (`FUD1065`). */
export function unexpected(node: LineNode, parent: LineNode, expected: readonly string[], c: Ctx): void {
  const first = node.tokens[0]!;
  c.out.push(FUD1065({ span: first.span, word: first.raw, parent: label(parent), expected }));
}

/** A line that takes nothing below it: its first child is reported, the rest skipped. */
export function leaf(node: LineNode, c: Ctx): void {
  const child = node.children[0];
  if (child !== undefined) unexpected(child, node, [], c);
}

/**
 * Whether `seen` is already given, reporting the repetition at `at` (`FUD1071`). The first one
 * counts; a builder skips the clause when this answers true.
 */
export function repeated(seen: unknown, at: Token, c: Ctx): boolean {
  if (seen === undefined) return false;
  c.out.push(FUD1071({ span: at.span, clause: at.raw }));
  return true;
}

/** `use <mw>+`, and the parameter lines below it, which go to its last middleware. */
export function useClause(node: LineNode, c: Ctx): UseClause | undefined {
  const keyword = node.tokens[0]!;
  const names = node.tokens.slice(1);
  if (names.length === 0) {
    c.out.push(FUD1063({ span: keyword.span, keyword: keyword.raw }));
    return undefined;
  }
  const args: MiddlewareArg[] = node.children.map((child) => ({
    name: shaped(child.tokens[0]!, 'identifier', 'parameter', c),
    values: child.tokens.slice(1).map(literal),
    span: child.span,
  }));
  const middlewares: MiddlewareRef[] = names.map((t, i) => ({
    name: shaped(t, 'kebab', 'middleware', c),
    args: i === names.length - 1 ? args : [],
  }));
  return { kind: 'use', keyword: keyword.span, middlewares, span: blockSpan(node) };
}

/** `skip <mw>+` or `skip *`. */
export function skipClause(node: LineNode, c: Ctx): SkipClause | undefined {
  const keyword = node.tokens[0]!;
  const rest = node.tokens.slice(1);
  leaf(node, c);
  if (rest.length === 0) {
    c.out.push(FUD1063({ span: keyword.span, keyword: keyword.raw }));
    return undefined;
  }
  if (rest[0]!.raw === '*') {
    trailing(node, 2, c);
    return { kind: 'skip', keyword: keyword.span, middlewares: [], all: rest[0]!.span, span: node.span };
  }
  return {
    kind: 'skip',
    keyword: keyword.span,
    middlewares: rest.map((t) => shaped(t, 'kebab', 'middleware', c)),
    span: node.span,
  };
}

const ENCODINGS = new Set(['gzip', 'deflate', 'deflate-raw']);

/** `compress <encoding> [<min>]` or `compress off` (`FUD1075` otherwise). */
export function compressClause(node: LineNode, c: Ctx): CompressClause | undefined {
  const [keyword, value, min] = node.tokens as [Token, Token?, Token?];
  leaf(node, c);
  const bad = (t: Token): undefined => {
    c.out.push(FUD1075({ span: t.span, text: t.raw, problem: 'compress' }));
    return undefined;
  };
  if (value === undefined) return bad(keyword);
  if (value.raw === 'off') {
    trailing(node, 2, c);
    return { kind: 'compress', keyword: keyword.span, off: value.span, span: node.span };
  }
  if (!ENCODINGS.has(value.raw)) return bad(value);
  const size = min !== undefined ? wholeNumber(min, 'number', c.out) : undefined;
  trailing(node, 3, c);
  return {
    kind: 'compress',
    keyword: keyword.span,
    encoding: name(value),
    ...(size !== undefined ? { min: size } : {}),
    span: node.span,
  };
}

/** A failure status: three digits, `400`–`599`. */
export function failureStatus(t: Token, c: Ctx): ReturnType<typeof wholeNumber> {
  const status = wholeNumber(t, 'status', c.out);
  if (status !== undefined && (status.value < 400 || status.value > 599)) {
    c.out.push(FUD1075({ span: t.span, text: t.raw, problem: 'status' }));
    return undefined;
  }
  return status;
}

/** `fails <code> <status> ["<detail>"]`. */
export function failsClause(node: LineNode, c: Ctx): FailsClause | undefined {
  const [keyword, code, status, detail] = node.tokens as [Token, Token?, Token?, Token?];
  leaf(node, c);
  if (code === undefined) {
    c.out.push(FUD1063({ span: keyword.span, keyword: keyword.raw }));
    return undefined;
  }
  const codeName = shaped(code, 'kebab', 'error code', c);
  const statusAt = status ?? { span: span(code.span.end, code.span.end), raw: '', quoted: [] };
  const value = failureStatus(statusAt, c);
  const text = detail !== undefined ? stringLiteral(detail) : undefined;
  trailing(node, text !== undefined || detail === undefined ? 4 : 3, c);
  if (value === undefined) return undefined;
  return {
    kind: 'fails',
    keyword: keyword.span,
    code: codeName,
    status: value,
    ...(text !== undefined ? { detail: text } : {}),
    ...(node.doc !== undefined ? { doc: node.doc } : {}),
    span: node.span,
  };
}

/**
 * The word `later` at `node.tokens[at]`, if it is there. Where it is not `allowed` it is
 * `FUD1324`; either way it is taken, so it is not reported again as left over.
 */
export function laterWord(
  node: LineNode,
  at: number,
  allowed: boolean,
  c: Ctx,
): { readonly later?: Span; readonly used: number } {
  const t = node.tokens[at];
  if (t?.raw !== 'later') return { used: 0 };
  if (!allowed) {
    c.out.push(FUD1324({ span: t.span }));
    return { used: 1 };
  }
  return { later: t.span, used: 1 };
}

/**
 * `<name>  <type>` with nothing else: a field of a `type`, `load` or `adds`, the parameter of a
 * rule or a middleware. A lone word is a line its parent does not take (`FUD1065`). A field of
 * `load` may end in `later` (`laterAllowed`); anywhere else that word is `FUD1324`.
 */
export function typedField(
  node: LineNode,
  parent: LineNode,
  expected: readonly string[],
  c: Ctx,
  laterAllowed = false,
): TypedField | undefined {
  const [first] = node.tokens as [Token];
  if (node.tokens.length < 2 || !isShape(first, 'identifier')) {
    unexpected(node, parent, expected, c);
    return undefined;
  }
  leaf(node, c);
  const { type, used } = readType(node.tokens.slice(1), c.out);
  const { later, used: marked } = laterWord(node, 1 + used, laterAllowed, c);
  trailing(node, 1 + used + marked, c);
  if (type === undefined) return undefined;
  return {
    kind: 'field',
    name: name(first),
    type,
    ...(later !== undefined ? { later } : {}),
    ...(node.doc !== undefined ? { doc: node.doc } : {}),
    span: node.span,
  };
}

/** The span of a declaration: its line and every line below it. */
export function blockSpan(node: LineNode): Span {
  let last = node;
  while (last.children.length > 0) last = last.children[last.children.length - 1]!;
  return span(node.span.start, last.span.end);
}
