/**
 * The builders of an extensions file's declarations: `rule`, `middleware` and `pattern`
 * (SDD §3.7–§3.9), and `pipe` (SDD-71 §3.2).
 */

import { FUD1063, FUD1076, FUD1077, FUD1340 } from '@fudic/diagnostics';
import type {
  AddsBlock,
  FailsClause,
  MiddlewareDecl,
  Name,
  PatternDecl,
  PipeDecl,
  PipeOn,
  RuleDebounce,
  RuleDecl,
  RuleFails,
  RuleOn,
  RuleRuns,
  SkipClause,
  TypeExpr,
  TypedField,
  UseClause,
} from './ast.js';
import {
  blockSpan,
  declName,
  failsClause,
  leaf,
  name,
  repeated,
  shaped,
  skipClause,
  trailing,
  typedField,
  unexpected,
  useClause,
  type Ctx,
} from './clauses.js';
import type { LineNode, Token } from './line.js';
import { readType } from './type.js';

const doc = (node: LineNode): { doc?: string } => (node.doc !== undefined ? { doc: node.doc } : {});

/** A keyword that takes nothing on its line: a word after it means a field named like it. */
function flag(node: LineNode, c: Ctx): boolean {
  leaf(node, c);
  if (node.tokens.length === 1) return true;
  c.out.push(FUD1076({ span: node.tokens[0]!.span, name: node.tokens[0]!.raw }));
  return false;
}

const TARGETS = ['field', 'group', 'form'];
const RUNS = ['both', 'server', 'remote'];
const RULE_LINES = ['on', 'runs', 'async', 'debounce', 'use', 'skip', 'fails', '<param> <type>'];

/** `rule <name>`: where it applies, where it runs, its parameters and its failures. */
export function ruleDecl(node: LineNode, c: Ctx): RuleDecl | undefined {
  const [keyword] = node.tokens as [Token];
  const ruleName = declName(node, 'kebab', 'rule', c);
  if (ruleName === undefined) return undefined;
  trailing(node, 2, c);

  let on: RuleOn | undefined;
  let runs: RuleRuns | undefined;
  let async: Token | undefined;
  let debounce: RuleDebounce | undefined;
  let debounceLine: Token | undefined;
  const uses: UseClause[] = [];
  const skips: SkipClause[] = [];
  const params: TypedField[] = [];
  const fails: RuleFails[] = [];

  for (const child of node.children) {
    const [head] = child.tokens as [Token];
    switch (head.raw) {
      case 'on':
        if (!repeated(on, head, c)) on = ruleOn(child, c);
        break;
      case 'runs': {
        if (repeated(runs, head, c)) break;
        leaf(child, c);
        const value = child.tokens[1];
        if (value === undefined) {
          c.out.push(FUD1063({ span: head.span, keyword: head.raw }));
        } else if (!RUNS.includes(value.raw)) {
          unexpected({ ...child, tokens: [value] }, child, RUNS, c);
        } else {
          trailing(child, 2, c);
          runs = { keyword: head.span, value: name(value), span: child.span };
        }
        break;
      }
      case 'async':
        if (!repeated(async, head, c) && flag(child, c)) async = head;
        break;
      case 'debounce':
        if (repeated(debounceLine, head, c)) break;
        debounceLine = head;
        debounce = ruleDebounce(child, c);
        break;
      case 'use': {
        const use = useClause(child, c);
        if (use !== undefined) uses.push(use);
        break;
      }
      case 'skip': {
        const skip = skipClause(child, c);
        if (skip !== undefined) skips.push(skip);
        break;
      }
      case 'fails': {
        leaf(child, c);
        const code = declName(child, 'kebab', 'error code', c);
        if (code === undefined) break;
        fails.push({
          keyword: head.span,
          code,
          params: child.tokens.slice(2).map((t) => shaped(t, 'identifier', 'parameter', c)),
          ...doc(child),
          span: child.span,
        });
        break;
      }
      default: {
        const param = typedField(child, node, RULE_LINES, c);
        if (param !== undefined) params.push(param);
      }
    }
  }

  return {
    kind: 'rule',
    keyword: keyword.span,
    name: ruleName,
    ...(on !== undefined ? { on } : {}),
    ...(runs !== undefined ? { runs } : {}),
    ...(async !== undefined ? { async: async.span } : {}),
    ...(debounce !== undefined ? { debounce } : {}),
    uses,
    skips,
    params,
    fails,
    ...doc(node),
    span: blockSpan(node),
  };
}

/** `debounce <ms>`: a whole number of milliseconds, `0` included. */
function ruleDebounce(node: LineNode, c: Ctx): RuleDebounce | undefined {
  leaf(node, c);
  const [keyword, value] = node.tokens as [Token, Token?];
  if (value === undefined) {
    c.out.push(FUD1063({ span: keyword.span, keyword: keyword.raw }));
    return undefined;
  }
  if (!/^\d+$/u.test(value.raw)) {
    unexpected({ ...node, tokens: [value] }, { ...node, tokens: [keyword] }, ['<milliseconds>'], c);
    return undefined;
  }
  trailing(node, 2, c);
  return { keyword: keyword.span, value: { kind: 'number', value: Number(value.raw), span: value.span }, span: node.span };
}

/** `on field <type>+`, `on group` or `on form`. */
function ruleOn(node: LineNode, c: Ctx): RuleOn | undefined {
  leaf(node, c);
  const [keyword, target] = node.tokens as [Token, Token?];
  if (target === undefined) {
    c.out.push(FUD1063({ span: keyword.span, keyword: keyword.raw }));
    return undefined;
  }
  if (!TARGETS.includes(target.raw)) {
    unexpected({ ...node, tokens: [target] }, node, TARGETS, c);
    return undefined;
  }
  const types: TypeExpr[] = [];
  if (target.raw === 'field') {
    let rest = node.tokens.slice(2);
    if (rest.length === 0) c.out.push(FUD1063({ span: target.span, keyword: `${keyword.raw} ${target.raw}` }));
    while (rest.length > 0) {
      const { type, used } = readType(rest, c.out);
      if (type !== undefined) types.push(type);
      rest = rest.slice(used);
    }
  } else {
    trailing(node, 2, c);
  }
  return { keyword: keyword.span, target: name(target), types, span: node.span };
}

const PIPE_LINES = ['on', '<param> <type>'];

/**
 * `pipe <name>`: `on <type>+` and its parameters (SDD-71 §3.2). Without `on` it is `FUD1340` on
 * its name, and the pipe is still read, so the rest of the file and the editor keep it.
 */
export function pipeDecl(node: LineNode, c: Ctx): PipeDecl | undefined {
  const [keyword] = node.tokens as [Token];
  const pipeName = declName(node, 'kebab', 'pipe', c);
  if (pipeName === undefined) return undefined;
  trailing(node, 2, c);

  let on: PipeOn | undefined;
  let onLine: Token | undefined;
  const params: TypedField[] = [];
  for (const child of node.children) {
    const [head] = child.tokens as [Token];
    if (head.raw === 'on') {
      if (repeated(onLine, head, c)) continue;
      onLine = head;
      const read = pipeOn(child, c);
      if (read !== undefined) on = read;
    } else {
      const param = typedField(child, node, PIPE_LINES, c);
      if (param !== undefined) params.push(param);
    }
  }
  if (onLine === undefined) c.out.push(FUD1340({ span: pipeName.span, name: pipeName.text }));

  return {
    kind: 'pipe',
    keyword: keyword.span,
    name: pipeName,
    ...(on !== undefined ? { on } : {}),
    params,
    ...doc(node),
    span: blockSpan(node),
  };
}

/** `on <type>+`: one type, or several for a union. */
function pipeOn(node: LineNode, c: Ctx): PipeOn | undefined {
  leaf(node, c);
  const [keyword] = node.tokens as [Token];
  let rest = node.tokens.slice(1);
  if (rest.length === 0) {
    c.out.push(FUD1063({ span: keyword.span, keyword: keyword.raw }));
    return undefined;
  }
  const types: TypeExpr[] = [];
  while (rest.length > 0) {
    const { type, used } = readType(rest, c.out);
    if (type !== undefined) types.push(type);
    rest = rest.slice(used);
  }
  return { keyword: keyword.span, types, span: node.span };
}

const MIDDLEWARE_LINES =['client', 'server', 'adds', 'fails', '<param> <type>'];

/** `middleware <name>`: its halves, its parameters, what it adds and how it fails. */
export function middlewareDecl(node: LineNode, c: Ctx): MiddlewareDecl | undefined {
  const [keyword] = node.tokens as [Token];
  const mwName = declName(node, 'kebab', 'middleware', c);
  if (mwName === undefined) return undefined;
  trailing(node, 2, c);

  let client: Token | undefined;
  let server: Token | undefined;
  let adds: AddsBlock | undefined;
  const params: TypedField[] = [];
  const fails: FailsClause[] = [];

  for (const child of node.children) {
    const [head] = child.tokens as [Token];
    if (head.raw === 'client') {
      if (!repeated(client, head, c) && flag(child, c)) client = head;
    } else if (head.raw === 'server') {
      if (!repeated(server, head, c) && flag(child, c)) server = head;
    } else if (head.raw === 'adds') {
      if (repeated(adds, head, c)) continue;
      if (child.tokens.length > 1) {
        c.out.push(FUD1076({ span: head.span, name: head.raw }));
        continue;
      }
      const fields = child.children
        .map((f) => typedField(f, child, ['<field> <type>'], c))
        .filter((f): f is TypedField => f !== undefined);
      adds = { keyword: head.span, fields, span: blockSpan(child) };
    } else if (head.raw === 'fails') {
      const f = failsClause(child, c);
      if (f !== undefined) fails.push(f);
    } else {
      const param = typedField(child, node, MIDDLEWARE_LINES, c);
      if (param !== undefined) params.push(param);
    }
  }
  // A middleware without halves is a mark the compiler reads, as `json` (SDD-67 §8.1, 14).
  return {
    kind: 'middleware',
    keyword: keyword.span,
    name: mwName,
    ...(client !== undefined ? { client: client.span } : {}),
    ...(server !== undefined ? { server: server.span } : {}),
    params,
    ...(adds !== undefined ? { adds } : {}),
    fails,
    ...doc(node),
    span: blockSpan(node),
  };
}

/** `pattern <name> <regex>`: the regex is the rest of the line, checked by compiling it. */
export function patternDecl(node: LineNode, c: Ctx): PatternDecl | undefined {
  const [keyword] = node.tokens as [Token];
  leaf(node, c);
  const patternName = declName(node, 'kebab', 'pattern', c);
  if (patternName === undefined) return undefined;
  const rest = node.tokens[2];
  if (rest === undefined) {
    c.out.push(FUD1077({ span: patternName.span, reason: 'the pattern is empty' }));
    return undefined;
  }
  const regex: Name = name(rest);
  try {
    new RegExp(regex.text);
  } catch (e) {
    c.out.push(FUD1077({ span: regex.span, reason: (e as Error).message }));
  }
  return { kind: 'pattern', keyword: keyword.span, name: patternName, source: regex, ...doc(node), span: node.span };
}
