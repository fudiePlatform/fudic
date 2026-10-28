/**
 * The checks of a `form` (SDD §3.6, §3.7, §4.2 steps 3–4): its field types and initial values,
 * the rules under each field and in each `summary` — that they exist, apply to the type, go in
 * that place, take those arguments and fill the placeholders of their text — and the fields
 * and types of every `require` and `when`.
 */

import {
  FUD1080,
  FUD1083,
  FUD1084,
  FUD1085,
  FUD1094,
  FUD1095,
  FUD1098,
  FUD1260,
  type SourceDiagnostic,
} from '@fudic/diagnostics';
import type {
  ArgDecl,
  Expr,
  FieldDecl,
  FormDecl,
  FormMember,
  PathExpr,
  RuleDecl,
  RuleTarget,
  RuleUse,
  StringLiteral,
  SummaryBlock,
  TypeExpr,
} from './ast.js';
import { typeText, type ApiIndex, type Declared } from './index-api.js';
import { checkType, fitsWidth, isNumeric, literalFits } from './types-check.js';

interface Ctx {
  readonly index: ApiIndex;
  readonly out: SourceDiagnostic[];
}

export function checkForm(form: FormDecl, index: ApiIndex, out: SourceDiagnostic[]): void {
  const c: Ctx = { index, out };
  members(form.fields, c);
  if (form.summary !== undefined) summary(form.summary, 'form', form.fields, c);
}

function members(list: readonly FormMember[], c: Ctx): void {
  for (const member of list) {
    if (member.kind === 'form-group') {
      members(member.fields, c);
      if (member.summary !== undefined) summary(member.summary, 'group', member.fields, c);
    } else {
      field(member, c);
    }
  }
}

function field(f: FieldDecl, c: Ctx): void {
  checkType(f.type, c.index, {}, c.out);
  if (f.initial !== undefined && !initialFits(f.initial, f.type)) {
    c.out.push(FUD1094({ span: f.initial.span, value: written(f.initial), type: typeText(f.type) }));
  }
  if (f.range !== undefined) placeholders(f.range, ['min', 'max'], c);
  for (const use of f.rules) {
    const rule = resolve(use, c);
    if (rule === undefined) continue;
    if (!place(use, rule.on?.target.text, 'field', 'a field', c)) continue;
    if (rule.on !== undefined && !c.index.rulesFor(f.type).some((r) => r.decl === rule)) {
      c.out.push(FUD1083({ span: use.name.span, rule: use.name.text, type: typeText(f.type), accepts: rule.on.types.map(typeText) }));
    }
    args(use, rule, c);
  }
}

/** The rules an argument takes: the built-ins of `@fudic/forms` (SDD-67 §3.5). */
const ARG_RULES: ReadonlySet<string> = new Set(['required', 'min', 'max', 'min-length', 'max-length', 'pattern']);

/** Whether a declared rule is one of the six of `@fudic/forms`, the only ones an argument takes. */
export const isArgRule = (found: Declared<RuleDecl>): boolean =>
  typeof found.source.origin === 'object' && found.source.origin.package === '@fudic/forms' && ARG_RULES.has(found.decl.name.text);

/**
 * The rules under a function's argument, checked as those under a field (SDD-67 §3.5): they
 * exist, apply to its type, take those arguments and fill their text; and a rule that is not one
 * of the six of `@fudic/forms` is `FUD1260`.
 */
export function checkArgRules(arg: ArgDecl, index: ApiIndex, out: SourceDiagnostic[]): void {
  const c: Ctx = { index, out };
  for (const use of arg.rules) {
    if (resolve(use, c) === undefined) continue;
    const found = index.lookup('rule', use.name.text)!;
    if (!isArgRule(found)) {
      out.push(FUD1260({ span: use.name.span, rule: use.name.text }));
      continue;
    }
    if (!index.rulesFor(arg.type).some((r) => r.decl === found.decl)) {
      const accepts = found.decl.on!.types.map(typeText);
      out.push(FUD1083({ span: use.name.span, rule: use.name.text, type: typeText(arg.type), accepts, under: 'argument' }));
    }
    args(use, found.decl, c);
  }
}

/** An initial value as it was written. */
function written(lit: NonNullable<FieldDecl['initial']>): string {
  switch (lit.kind) {
    case 'string':
      return `"${lit.text}"`;
    case 'number':
    case 'bool':
      return String(lit.value);
    default:
      return '[]';
  }
}

/** An initial value of the field's type (a word never gets here: the parser refused it). */
function initialFits(lit: NonNullable<FieldDecl['initial']>, type: TypeExpr): boolean {
  if (type.kind === 'list') return lit.kind === 'empty-list';
  if (type.kind !== 'named') return false;
  const name = type.name.text;
  if (name === 'bool') return lit.kind === 'bool';
  if (isNumeric(name)) return lit.kind === 'number' && fitsWidth(lit.value, name);
  return lit.kind === 'string';
}

/** The rule a use names, or `undefined` having reported it unknown (`FUD1080`). */
function resolve(use: RuleUse, c: Ctx): RuleDecl | undefined {
  const found = c.index.lookup('rule', use.name.text);
  if (found === undefined) {
    c.out.push(FUD1080({ span: use.name.span, name: use.name.text, what: 'rule', candidates: c.index.candidates('rule', use.name.text) }));
  }
  return found?.decl;
}

/** Whether a rule of `target` goes where it is used (`FUD1098` otherwise). A rule without `on` goes anywhere: it is reported where it is declared. */
function place(use: RuleUse, target: string | undefined, here: RuleTarget, where: string, c: Ctx): boolean {
  if (target === undefined || target === here) return true;
  c.out.push(FUD1098({ span: use.name.span, rule: use.name.text, target, place: where }));
  return false;
}

/** The arguments of a use against the rule's parameters (`FUD1084`), and its text (`FUD1085`). */
function args(use: RuleUse, rule: RuleDecl, c: Ctx): void {
  const signature = rule.params.length === 0 ? 'no arguments' : rule.params.map((p) => `${p.name.text} ${typeText(p.type)}`).join(', ');
  const report = (problem: 'many' | 'few' | 'type'): void => {
    c.out.push(FUD1084({ span: use.name.span, rule: use.name.text, signature, problem }));
  };
  if (use.args.length > rule.params.length) report('many');
  else if (use.args.length < rule.params.length) report('few');
  else if (use.args.some((a, i) => !literalFits(a, rule.params[i]!.type, c.index))) report('type');

  if (use.text === undefined) return;
  const offered = rule.fails.flatMap((f) => f.params.map((p) => p.text));
  if (rule.runs?.value.text === 'server') offered.push('detail');
  placeholders(use.text, offered, c);
}

/** Reports the first `{x}` of a text that is not among `offered` (`FUD1085`). */
function placeholders(text: StringLiteral, offered: readonly string[], c: Ctx): void {
  for (const m of text.text.matchAll(/\{([^}]*)\}/gu)) {
    if (offered.includes(m[1]!)) continue;
    const phrase = offered.length === 0 ? 'nothing' : offered.map((o) => `{${o}}`).join(', ');
    c.out.push(FUD1085({ span: text.span, placeholder: m[1]!, offered: phrase }));
    return;
  }
}

/** The rules, `require` and `when` of a `summary`, against the fields of its scope. */
function summary(block: SummaryBlock, here: 'group' | 'form', scope: readonly FormMember[], c: Ctx): void {
  const where = here === 'group' ? 'a group summary' : 'a form summary';
  for (const item of block.items) {
    if (item.kind === 'rule-use') {
      const rule = resolve(item, c);
      if (rule !== undefined && place(item, rule.on?.target.text, here, where, c)) args(item, rule, c);
      continue;
    }
    const requires = item.kind === 'when' ? item.rules : [item];
    if (item.kind === 'when' && item.expr !== undefined) expect(item.expr, 'bool', 'when', scope, c);
    for (const r of requires) {
      if (r.expr !== undefined) expect(r.expr, 'bool', 'require', scope, c);
      if (r.on !== undefined) lookupPath(r.on, scope, c);
      if (r.text !== undefined) placeholders(r.text, [], c);
    }
  }
}

/** What an expression's value is, for the checks of `FUD1095`. `list:<elem>` for a list. */
type Kind = string;

/** The member a path names in `scope`, through its groups (`FUD1095` when none). */
function lookupPath(path: PathExpr, scope: readonly FormMember[], c: Ctx): FormMember | undefined {
  let members = scope;
  let found: FormMember | undefined;
  for (const segment of path.segments) {
    found = members.find((m) => m.name.text === segment.text);
    if (found === undefined) {
      c.out.push(FUD1095({ span: path.span, text: path.segments.map((s) => s.text).join('.'), problem: 'unknown' }));
      return undefined;
    }
    members = found.kind === 'form-group' ? found.fields : [];
  }
  return found;
}

/** The kind of a field's value: its type's name, `list:<elem>` for a list, `group` for a group. */
function kindOfMember(member: FormMember): Kind {
  if (member.kind === 'form-group') return 'group';
  return kindOfType(member.type);
}

function kindOfType(type: TypeExpr): Kind {
  if (type.kind === 'list') return `list:${kindOfType(type.element)}`;
  if (type.kind !== 'named') return typeText(type);
  const name = type.name.text;
  return isNumeric(name) ? 'number' : name === 'uuid' ? 'str' : name;
}

/** The kind of `expr`, or `undefined` when a part of it was already reported. */
function kindOf(expr: Expr, scope: readonly FormMember[], c: Ctx): Kind | undefined {
  switch (expr.kind) {
    case 'path': {
      const member = lookupPath(expr, scope, c);
      return member === undefined ? undefined : kindOfMember(member);
    }
    case 'literal':
      return expr.literal.kind === 'string' ? 'str' : expr.literal.kind;
    case 'group':
      return kindOf(expr.inner, scope, c);
    case 'not':
      return expect(expr.operand, 'bool', 'not', scope, c) ? 'bool' : undefined;
    case 'call': {
      const arg = kindOf(expr.arg, scope, c);
      if (arg === undefined) return undefined;
      if (expr.fn.text !== 'length') return 'bool';
      return arg === 'str' || arg.startsWith('list:') ? 'number' : mismatch(expr.span, 'length', c);
    }
    case 'binary': {
      if (expr.op === 'and' || expr.op === 'or') {
        const left = expect(expr.left, 'bool', expr.op, scope, c);
        const right = expect(expr.right, 'bool', expr.op, scope, c);
        return left && right ? 'bool' : undefined;
      }
      const left = kindOf(expr.left, scope, c);
      const right = kindOf(expr.right, scope, c);
      if (left === undefined || right === undefined) return undefined;
      return compatible(expr.op, left, right) ? 'bool' : mismatch(expr.span, expr.op, c);
    }
  }
}

function compatible(op: string, left: Kind, right: Kind): boolean {
  if (op === 'contains') return (left === 'str' && right === 'str') || left === `list:${right}`;
  if (op === '==' || op === '!=') return left === right && left !== 'group';
  return left === right && (left === 'number' || left === 'date');
}

/** Reports `op` over `span` as mixing types (`FUD1095`). */
function mismatch(span: Expr['span'], op: string, c: Ctx): undefined {
  c.out.push(FUD1095({ span, text: op, problem: 'types' }));
  return undefined;
}

/** Whether `expr`, an operand of `op`, is of `kind`, reporting it when not (`FUD1095`). */
function expect(expr: Expr, kind: Kind, op: string, scope: readonly FormMember[], c: Ctx): boolean {
  const got = kindOf(expr, scope, c);
  if (got === undefined) return false;
  if (got === kind) return true;
  mismatch(expr.span, op, c);
  return false;
}
