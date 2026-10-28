/**
 * The builder of a `form` (SDD §3.6). A line is known by where it is, never by guessing its
 * second word: under a form or a group go its options, its fields and its `summary`; under a
 * field, its options and its rules; under a `summary`, rules, `require` and `when`.
 */

import { FUD1063, FUD1068, FUD1069, FUD1073, FUD1076, span } from '@fudic/diagnostics';
import type {
  CatchesOption,
  FieldDecl,
  FormDecl,
  FormGroup,
  FormMember,
  NumberLiteral,
  PathExpr,
  RequireRule,
  RuleUse,
  StringLiteral,
  SummaryBlock,
  SummaryItem,
  ValidateOnOption,
  ValidityOption,
  WhenBlock,
} from './ast.js';
import {
  blockSpan,
  declName,
  failureStatus,
  isShape,
  leaf,
  name,
  repeated,
  shaped,
  trailing,
  unexpected,
  type Ctx,
} from './clauses.js';
import { parseExpr } from './expr.js';
import { isString, type LineNode, type Token } from './line.js';
import { cover, initialValue, literal, readType, stringLiteral, text } from './type.js';

const doc = (node: LineNode): { doc?: string } => (node.doc !== undefined ? { doc: node.doc } : {});

const EVENTS = ['submit', 'blur', 'input'];
const VALIDITY = ['rules', 'interacted'];

/** `validate-on <event>+`. */
function validateOn(node: LineNode, c: Ctx): ValidateOnOption | undefined {
  leaf(node, c);
  const [keyword] = node.tokens as [Token];
  const events = node.tokens.slice(1);
  if (events.length === 0) {
    c.out.push(FUD1063({ span: keyword.span, keyword: keyword.raw }));
    return undefined;
  }
  const known = events.filter((e) => {
    if (EVENTS.includes(e.raw)) return true;
    unexpected({ ...node, tokens: [e] }, node, EVENTS, c);
    return false;
  });
  return { keyword: keyword.span, events: known.map(name), span: node.span };
}

/** `validity <rules|interacted>`. */
function validity(node: LineNode, c: Ctx): ValidityOption | undefined {
  leaf(node, c);
  const [keyword, value] = node.tokens as [Token, Token?];
  if (value === undefined) {
    c.out.push(FUD1063({ span: keyword.span, keyword: keyword.raw }));
    return undefined;
  }
  trailing(node, 2, c);
  if (!VALIDITY.includes(value.raw)) {
    unexpected({ ...node, tokens: [value] }, node, VALIDITY, c);
    return undefined;
  }
  return { keyword: keyword.span, value: name(value), span: node.span };
}

/** `catches <status>+`. */
function catches(node: LineNode, c: Ctx): CatchesOption | undefined {
  leaf(node, c);
  const [keyword] = node.tokens as [Token];
  if (node.tokens.length === 1) {
    c.out.push(FUD1063({ span: keyword.span, keyword: keyword.raw }));
    return undefined;
  }
  const statuses = node.tokens
    .slice(1)
    .map((t) => failureStatus(t, c))
    .filter((s): s is NumberLiteral => s !== undefined);
  return { keyword: keyword.span, statuses, span: node.span };
}

/** The options a form, a group and a field share, and what each saw. */
interface Options {
  validateOn?: ValidateOnOption;
  validity?: ValidityOption;
}

/** Reads `validate-on`/`validity` into `options`; false for any other line. */
function option(child: LineNode, options: Options, c: Ctx): boolean {
  const [head] = child.tokens as [Token];
  if (head.raw === 'validate-on') {
    if (!repeated(options.validateOn, head, c)) {
      const v = validateOn(child, c);
      if (v !== undefined) options.validateOn = v;
    }
    return true;
  }
  if (head.raw === 'validity') {
    if (!repeated(options.validity, head, c)) {
      const v = validity(child, c);
      if (v !== undefined) options.validity = v;
    }
    return true;
  }
  return false;
}

/** `summary` takes nothing on its line: a word after it means a field called `summary`. */
function summaryLine(child: LineNode, c: Ctx): boolean {
  if (child.tokens.length > 1) {
    c.out.push(FUD1076({ span: child.tokens[0]!.span, name: 'summary' }));
    return false;
  }
  return true;
}

/** The members, options and `summary` below a form or a group. */
function members(
  node: LineNode,
  allowCatches: boolean,
  c: Ctx,
): { options: Options; catches?: CatchesOption; fields: FormMember[]; summary?: SummaryBlock } {
  const options: Options = {};
  const fields: FormMember[] = [];
  let caught: CatchesOption | undefined;
  let summary: SummaryBlock | undefined;
  const expected = ['validate-on', 'validity', ...(allowCatches ? ['catches'] : []), 'summary', '<field> <type>'];

  for (const child of node.children) {
    const [head] = child.tokens as [Token];
    if (option(child, options, c)) continue;
    if (head.raw === 'catches' && allowCatches) {
      if (!repeated(caught, head, c)) caught = catches(child, c);
    } else if (head.raw === 'summary') {
      if (summaryLine(child, c) && !repeated(summary, head, c)) summary = summaryBlock(child, c);
    } else if (child.tokens.length >= 2 && isShape(head, 'identifier')) {
      const member = memberOf(child, c);
      if (member !== undefined) fields.push(member);
    } else {
      unexpected(child, node, expected, c);
    }
  }
  return {
    options,
    ...(caught !== undefined ? { catches: caught } : {}),
    fields,
    ...(summary !== undefined ? { summary } : {}),
  };
}

/** `form <name>` and all below it. */
export function formDecl(node: LineNode, c: Ctx): FormDecl | undefined {
  const [keyword] = node.tokens as [Token];
  const formName = declName(node, 'identifier', 'form', c);
  if (formName === undefined) return undefined;
  trailing(node, 2, c);
  const body = members(node, true, c);
  if (body.fields.length === 0) c.out.push(FUD1073({ span: formName.span, block: 'form' }));
  return {
    kind: 'form',
    keyword: keyword.span,
    name: formName,
    ...body.options,
    ...(body.catches !== undefined ? { catches: body.catches } : {}),
    fields: body.fields,
    ...(body.summary !== undefined ? { summary: body.summary } : {}),
    ...doc(node),
    span: blockSpan(node),
  };
}

/** A field or a group: `<name>  group` or `<name>  <type> [= <value>]`. */
function memberOf(node: LineNode, c: Ctx): FormMember | undefined {
  const [first, second] = node.tokens as [Token, Token];
  const fieldName = shaped(first, 'identifier', 'field', c);

  if (second.raw === 'group') {
    trailing(node, 2, c);
    const body = members(node, false, c);
    if (body.fields.length === 0) c.out.push(FUD1073({ span: fieldName.span, block: 'group' }));
    const group: FormGroup = {
      kind: 'form-group',
      name: fieldName,
      keyword: second.span,
      ...body.options,
      fields: body.fields,
      ...(body.summary !== undefined ? { summary: body.summary } : {}),
      ...doc(node),
      span: blockSpan(node),
    };
    return group;
  }

  const { type, used } = readType(node.tokens.slice(1), c.out);
  let at = 1 + used;
  let initial;
  if (node.tokens[at]?.raw === '=') {
    const value = node.tokens[at + 1];
    if (value === undefined) c.out.push(FUD1068({ span: node.tokens[at]!.span, text: '', kind: 'value' }));
    else initial = initialValue(value, c.out);
    at += 2;
  }
  trailing(node, at, c);

  const options: Options = {};
  const rules: RuleUse[] = [];
  let range: StringLiteral | undefined;
  for (const child of node.children) {
    const [head] = child.tokens as [Token];
    if (option(child, options, c)) continue;
    if (head.raw === 'range') {
      if (repeated(range, head, c)) continue;
      leaf(child, c);
      const t = child.tokens[1];
      if (t === undefined) c.out.push(FUD1063({ span: head.span, keyword: head.raw }));
      else range = text(t, c.out);
      trailing(child, 2, c);
    } else {
      const rule = ruleUse(child, node, FIELD_LINES, c);
      if (rule !== undefined) rules.push(rule);
    }
  }

  if (type === undefined) return undefined;
  const field: FieldDecl = {
    kind: 'form-field',
    name: fieldName,
    type,
    ...(initial !== undefined ? { initial } : {}),
    ...options,
    ...(range !== undefined ? { range } : {}),
    rules,
    ...doc(node),
    span: blockSpan(node),
  };
  return field;
}

const FIELD_LINES = ['validate-on', 'validity', 'range', '<rule>'];
const SUMMARY_LINES = ['require', 'when', '<rule>'];

/** `<rule> <arg>* ["<text>"]`: the last token is the text when it is a string. */
export function ruleUse(node: LineNode, parent: LineNode, expected: readonly string[], c: Ctx): RuleUse | undefined {
  const [head] = node.tokens as [Token];
  if (!isShape(head, 'kebab')) {
    unexpected(node, parent, expected, c);
    return undefined;
  }
  leaf(node, c);
  const rest = node.tokens.slice(1);
  const last = rest[rest.length - 1];
  const message = last !== undefined ? stringLiteral(last) : undefined;
  const args = (message !== undefined ? rest.slice(0, -1) : rest).map(literal);
  return {
    kind: 'rule-use',
    name: name(head),
    args,
    ...(message !== undefined ? { text: message } : {}),
    ...doc(node),
    span: node.span,
  };
}

/** `summary` and its rules, `require` and `when`. */
function summaryBlock(node: LineNode, c: Ctx): SummaryBlock {
  const items: SummaryItem[] = [];
  for (const child of node.children) {
    const head = child.tokens[0]!.raw;
    const item =
      head === 'require' ? requireRule(child, c) : head === 'when' ? whenBlock(child, c) : ruleUse(child, node, SUMMARY_LINES, c);
    if (item !== undefined) items.push(item);
  }
  return { keyword: node.tokens[0]!.span, items, span: blockSpan(node) };
}

const COMPARISONS = new Set(['==', '!=', '<', '<=', '>', '>=', 'contains']);
const PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/u;

/** `require <code> <expr> ["<text>"] [on <field>]`; the text may come after `on` too. */
function requireRule(node: LineNode, c: Ctx): RequireRule | undefined {
  leaf(node, c);
  const [keyword] = node.tokens as [Token];
  const code = declName(node, 'kebab', 'error code', c);
  if (code === undefined) return undefined;

  let rest = node.tokens.slice(2);
  let message: StringLiteral | undefined;
  const takeText = (): void => {
    const last = rest[rest.length - 1];
    const before = rest[rest.length - 2];
    if (message !== undefined || last === undefined || !isString(last)) return;
    if (before !== undefined && COMPARISONS.has(before.raw)) return;
    message = stringLiteral(last);
    rest = rest.slice(0, -1);
  };
  takeText();
  let on: PathExpr | undefined;
  if (rest.length >= 2 && rest[rest.length - 2]!.raw === 'on') {
    on = pathOf(rest[rest.length - 1]!, c);
    rest = rest.slice(0, -2);
    takeText();
  }

  let expr;
  if (rest.length === 0) c.out.push(FUD1069({ span: span(code.span.end, code.span.end), near: 'end of line' }));
  else expr = parseExpr(c.source, rest[0]!.span.start, cover(rest).end, c.out);

  return {
    kind: 'require',
    keyword: keyword.span,
    code,
    ...(expr !== undefined ? { expr } : {}),
    ...(message !== undefined ? { text: message } : {}),
    ...(on !== undefined ? { on } : {}),
    ...doc(node),
    span: node.span,
  };
}

/** The field after `on`: a path, or `undefined` having reported it (`FUD1069`). */
function pathOf(t: Token, c: Ctx): PathExpr | undefined {
  if (!PATH.test(t.raw)) {
    c.out.push(FUD1069({ span: t.span, near: t.raw }));
    return undefined;
  }
  let at = t.span.start;
  const segments = t.raw.split('.').map((text) => {
    const s = { text, span: span(at, at + text.length) };
    at += text.length + 1;
    return s;
  });
  return { kind: 'path', segments, span: t.span };
}

/** `when <expr>` and the `require` lines below it. */
function whenBlock(node: LineNode, c: Ctx): WhenBlock {
  const [keyword] = node.tokens as [Token];
  const rest = node.tokens.slice(1);
  let expr;
  if (rest.length === 0) c.out.push(FUD1069({ span: span(keyword.span.end, keyword.span.end), near: 'end of line' }));
  else expr = parseExpr(c.source, rest[0]!.span.start, cover(rest).end, c.out);
  const rules: RequireRule[] = [];
  for (const child of node.children) {
    if (child.tokens[0]!.raw !== 'require') {
      unexpected(child, node, ['require'], c);
      continue;
    }
    const rule = requireRule(child, c);
    if (rule !== undefined) rules.push(rule);
  }
  return {
    kind: 'when',
    keyword: keyword.span,
    ...(expr !== undefined ? { expr } : {}),
    rules,
    ...doc(node),
    span: blockSpan(node),
  };
}
