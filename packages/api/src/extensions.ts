/**
 * The builders of an extensions file's declarations: `rule`, `middleware` and `pattern`
 * (SDD §3.7–§3.9).
 */

import { FUD1063, FUD1076, FUD1077 } from '@fudic/diagnostics';
import type {
  AddsBlock,
  FailsClause,
  MiddlewareDecl,
  Name,
  PatternDecl,
  RuleDecl,
  RuleFails,
  RuleOn,
  RuleRuns,
  TypeExpr,
  TypedField,
} from './ast.js';
import {
  blockSpan,
  declName,
  failsClause,
  leaf,
  name,
  repeated,
  shaped,
  trailing,
  typedField,
  unexpected,
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
const RUNS = ['both', 'server'];
const RULE_LINES = ['on', 'runs', 'async', 'fails', '<param> <type>'];

/** `rule <name>`: where it applies, where it runs, its parameters and its failures. */
export function ruleDecl(node: LineNode, c: Ctx): RuleDecl | undefined {
  const [keyword] = node.tokens as [Token];
  const ruleName = declName(node, 'kebab', 'rule', c);
  if (ruleName === undefined) return undefined;
  trailing(node, 2, c);

  let on: RuleOn | undefined;
  let runs: RuleRuns | undefined;
  let async: Token | undefined;
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
    params,
    fails,
    ...doc(node),
    span: blockSpan(node),
  };
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

const MIDDLEWARE_LINES = ['client', 'server', 'adds', 'fails', '<param> <type>'];

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
