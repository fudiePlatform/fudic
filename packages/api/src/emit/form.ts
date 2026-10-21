/**
 * A `form` emitted (SDD-60 §3.6, §4.3): the same declaration `person.form.ts` writes by hand
 * today — typed factories, rules in order, texts as template functions, the `summary` as a list
 * of rules — and its two types: the schema the view binds, and the value a handler receives
 * once validated, without `null` where the field is `required`.
 */

import type { Expr, FieldDecl, FormDecl, FormGroup, FormMember, RequireRule, RuleUse, StringLiteral, SummaryBlock, TypeExpr, ValidateOnOption, ValidityOption } from '../ast.js';
import { FLOATS, INTEGERS } from '../types-check.js';
import { camel, literal, projectRef, str, tsType, type EmitCtx } from './shared.js';

/** The name of the field type a `.fudapi` type is, without `?`. */
const bare = (t: TypeExpr): TypeExpr => (t.kind === 'optional' ? t.inner : t);
const nameOf = (t: TypeExpr): string => (t.kind === 'named' ? t.name.text : 'str');
const isNumber = (name: string): boolean => name in INTEGERS || FLOATS.has(name);
const isRequired = (f: FieldDecl): boolean => f.rules.some((r) => r.name.text === 'required');

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

/** The control type of a field: `Str`, `Num`, `List<string>`… `used` collects the names. */
function controlType(t: TypeExpr, c: EmitCtx, used: Set<string>): string {
  const type = bare(t);
  if (type.kind === 'list') {
    used.add('List');
    return `List<${tsType(type.element, c)}>`;
  }
  const name = nameOf(type);
  const control = name === 'bool' ? 'Bool' : name === 'date' ? 'DateField' : isNumber(name) ? 'Num' : 'Str';
  used.add(control);
  return control;
}

/** `Form<{ name: Str; acceso: Form<{ … }> }>`: what the view binds. */
export function schemaType(members: readonly FormMember[], c: EmitCtx, used: Set<string>): string {
  used.add('Form');
  const fields = members.map((m) => `${m.name.text}: ${m.kind === 'form-group' ? schemaType(m.fields, c, used) : controlType(m.type, c, used)}`);
  return `Form<{ ${fields.join('; ')} }>`;
}

/** The validated value: `required` numbers and dates without `null`. */
export function valueType(members: readonly FormMember[], c: EmitCtx): string {
  const fields = members.map((m) => {
    if (m.kind === 'form-group') return `readonly ${m.name.text}: ${valueType(m.fields, c)}`;
    const type = bare(m.type);
    const name = nameOf(type);
    const nullable = type.kind === 'named' && (isNumber(name) || name === 'date') && !isRequired(m);
    const ts = type.kind === 'named' && !isNumber(name) && name !== 'date' && name !== 'bool' ? 'string' : tsType(type, c);
    return `readonly ${m.name.text}: ${ts}${nullable ? ' | null' : ''}`;
  });
  return `{ ${fields.join('; ')} }`;
}

// ---------------------------------------------------------------------------------------------
// Code
// ---------------------------------------------------------------------------------------------

/** What a block adds to a field below it: `require … on <field>`. */
interface Extra {
  readonly rules: string[];
  readonly texts: string[];
}

interface FormCtx {
  readonly c: EmitCtx;
  /** The names `@fudic/forms/contract` must give. */
  readonly used: Set<string>;
  /** `require … on` by the full path of its field. */
  readonly extras: Map<string, Extra>;
}

const FLAGS: Readonly<Record<string, number>> = { submit: 0, blur: 1, input: 2 };

/** The options of a node, as written in the object a factory takes. */
function options(entries: readonly (string | undefined)[]): string | undefined {
  const present = entries.filter((e): e is string => e !== undefined);
  return present.length === 0 ? undefined : `{ ${present.join(', ')} }`;
}

const validateOn = (o: ValidateOnOption | undefined): string | undefined =>
  o === undefined ? undefined : `validateOn: ${o.events.reduce((n, e) => n | (FLAGS[e.text] ?? 0), 0)}`;

const validity = (o: ValidityOption | undefined): string | undefined =>
  o === undefined ? undefined : `validity: ${o.value.text === 'rules' ? 0 : 1}`;

const messagesOf = (texts: readonly string[]): string | undefined => (texts.length === 0 ? undefined : `messages: { ${texts.join(', ')} }`);

/** `key: text("…")`. */
function textEntry(key: string, text: StringLiteral, f: FormCtx): string {
  f.used.add('text');
  return `${key}: text(${str(text.text)})`;
}

/** A rule named under a field or in a `summary`: its validator and its texts. */
function ruleUse(use: RuleUse, f: FormCtx, texts: string[]): string | undefined {
  const found = f.c.index.lookup('rule', use.name.text);
  if (found === undefined) return undefined;
  const ref = projectRef(f.c, 'rule', use.name.text)!;
  const params = found.decl.params.flatMap((p, i) => {
    const arg = use.args[i];
    if (arg === undefined) return [];
    const isPattern = p.type.kind === 'named' && p.type.name.text === 'pattern' && arg.kind === 'word';
    return [`${p.name.text}: ${isPattern ? (projectRef(f.c, 'pattern', arg.text) ?? 'undefined') : literal(arg)}`];
  });
  if (use.text !== undefined) for (const fail of found.decl.fails) texts.push(textEntry(camel(fail.code.text), use.text, f));
  return `${ref}.use(${params.length === 0 ? '' : `{ ${params.join(', ')} }`})`;
}

/** The range of a type, for `{min}` and `{max}` of its `range` text. */
function range(type: string, text: string): string {
  const [low, high] = INTEGERS[type] ?? ['', ''];
  return text.replace(/\{min\}/gu, String(low)).replace(/\{max\}/gu, String(high));
}

/** The initial value of a field: as written, or the empty value of its type. */
function initial(field: FieldDecl, type: TypeExpr): string {
  const name = nameOf(type);
  if (field.initial !== undefined) {
    const value = literal(field.initial);
    return name === 'date' && field.initial.kind === 'string' ? `new Date(${value})` : value;
  }
  if (type.kind === 'list') return '[]';
  if (name === 'bool') return 'false';
  return isNumber(name) || name === 'date' ? 'null' : '""';
}

/** The factory of a type: `str`, `u8`, `uuid`… */
function factory(type: TypeExpr, f: FormCtx): string {
  const name = nameOf(type);
  const fn = name === 'bool' || name === 'date' || name === 'uuid' || isNumber(name) ? name : 'str';
  f.used.add(fn);
  return fn;
}

function field(m: FieldDecl, path: string, f: FormCtx): string {
  const type = bare(m.type);
  const texts: string[] = [];
  const rules = m.rules.flatMap((r) => ruleUse(r, f, texts) ?? []);
  const extra = f.extras.get(path);
  if (extra !== undefined) {
    rules.push(...extra.rules);
    texts.push(...extra.texts);
  }
  if (m.range !== undefined) {
    const isUuid = nameOf(type) === 'uuid';
    texts.push(textEntry(isUuid ? 'uuid' : 'range', { ...m.range, text: range(nameOf(type), m.range.text) }, f));
  }
  const opts = options([messagesOf(texts), validateOn(m.validateOn), validity(m.validity)]);
  const args = [initial(m, type), ...(rules.length > 0 || opts !== undefined ? [`[${rules.join(', ')}]`] : []), ...(opts !== undefined ? [opts] : [])];
  if (type.kind === 'list') {
    f.used.add('arr');
    return `arr(${factory(bare(type.element), f)}, ${args.join(', ')})`;
  }
  return `${factory(type, f)}(${args.join(', ')})`;
}

/** The schema object of a block, its fields in order. */
function schema(members: readonly FormMember[], prefix: readonly string[], f: FormCtx, indent: string): string {
  const inner = `${indent}  `;
  const lines = members.map((m) => {
    const path = [...prefix, m.name.text];
    return `${inner}${m.name.text}: ${m.kind === 'form-group' ? group(m, path, f, inner) : field(m, path.join('.'), f)},`;
  });
  return `{\n${lines.join('\n')}\n${indent}}`;
}

function group(g: FormGroup, path: readonly string[], f: FormCtx, indent: string): string {
  f.used.add('group');
  const texts: string[] = [];
  const rules = summary(g.summary, path, f, texts);
  const opts = options([messagesOf(texts), validateOn(g.validateOn), validity(g.validity)]);
  return `group(${schema(g.fields, path, f, indent)}, [${rules.join(', ')}]${opts === undefined ? '' : `, ${opts}`})`;
}

/** The rules of a `summary`; its `require … on` go to their field's `extras`. */
function summary(block: SummaryBlock | undefined, path: readonly string[], f: FormCtx, texts: string[]): string[] {
  const rules: string[] = [];
  const requireOf = (r: RequireRule, when: Expr | undefined): void => {
    if (r.expr === undefined) return;
    const test = when === undefined ? expr(r.expr, path) : `!(${expr(when, path)}) || (${expr(r.expr, path)})`;
    const code = camel(r.code.text);
    const own = r.text === undefined ? [] : [textEntry(code, r.text, f)];
    if (r.on === undefined) {
      f.used.add('requireRule');
      rules.push(`requireRule(${str(code)}, (v, root) => ${test})`);
      texts.push(...own);
      return;
    }
    f.used.add('requireOn');
    const target = [...path, ...r.on.segments.map((s) => s.text)].join('.');
    const extra = f.extras.get(target) ?? { rules: [], texts: [] };
    f.extras.set(target, extra);
    extra.rules.push(`requireOn(${str(code)}, ${JSON.stringify(path)}, (v, root) => ${test})`);
    extra.texts.push(...own);
  };
  for (const item of block?.items ?? []) {
    if (item.kind === 'rule-use') rules.push(...(ruleUse(item, f, texts) ?? []));
    else if (item.kind === 'require') requireOf(item, undefined);
    else for (const r of item.rules) requireOf(r, item.expr);
  }
  usedHelpers(block, f);
  return rules;
}

/** The helpers a `summary`'s expressions call. */
function usedHelpers(block: SummaryBlock | undefined, f: FormCtx): void {
  const visit = (e: Expr | undefined): void => {
    if (e === undefined) return;
    if (e.kind === 'call') f.used.add(e.fn.text === 'valid' ? 'validAt' : e.fn.text === 'empty' ? 'isEmpty' : 'lengthOf');
    if (e.kind === 'not') visit(e.operand);
    if (e.kind === 'group') visit(e.inner);
    if (e.kind === 'binary') {
      if (e.op === '==' || e.op === '!=') f.used.add('same');
      else if (e.op === 'contains') f.used.add('contains');
      else if (e.op !== 'and' && e.op !== 'or') f.used.add('compare');
      visit(e.left);
      visit(e.right);
    }
  };
  for (const item of block?.items ?? []) {
    if (item.kind === 'when') {
      visit(item.expr);
      for (const r of item.rules) visit(r.expr);
    } else if (item.kind === 'require') visit(item.expr);
  }
}

/** A `require`/`when` expression over `v`, the value of its block. */
export function expr(e: Expr, path: readonly string[]): string {
  const access = (segments: readonly { readonly text: string }[]): string => `v${segments.map((s) => `.${s.text}`).join('')}`;
  switch (e.kind) {
    case 'path':
      return access(e.segments);
    case 'literal':
      return e.literal.kind === 'string' ? str(e.literal.text) : String(e.literal.value);
    case 'group':
      return `(${expr(e.inner, path)})`;
    case 'not':
      return `!${expr(e.operand, path)}`;
    case 'call': {
      if (e.fn.text === 'valid') return `validAt(root, ${JSON.stringify([...path, ...e.arg.segments.map((s) => s.text)])})`;
      return `${e.fn.text === 'empty' ? 'isEmpty' : 'lengthOf'}(${access(e.arg.segments)})`;
    }
    case 'binary': {
      const l = expr(e.left, path);
      const r = expr(e.right, path);
      switch (e.op) {
        case 'and':
          return `(${l} && ${r})`;
        case 'or':
          return `(${l} || ${r})`;
        case '==':
          return `same(${l}, ${r})`;
        case '!=':
          return `!same(${l}, ${r})`;
        case 'contains':
          return `contains(${l}, ${r})`;
        default:
          return `compare(${l}, ${str(e.op)}, ${r})`;
      }
    }
  }
}

/**
 * `formOf({ … }, [ … ], { … })`. A block's `summary` is read before its fields, so a
 * `require … on` reaches its field before the field is written.
 */
export function formCode(decl: FormDecl, c: EmitCtx, used: Set<string>): string {
  const f: FormCtx = { c, used, extras: new Map() };
  const texts: string[] = [];
  const rules = summary(decl.summary, [], f, texts);
  used.add('formOf');
  const opts = options([
    messagesOf(texts),
    validateOn(decl.validateOn),
    validity(decl.validity),
    decl.catches === undefined ? undefined : `catches: [${decl.catches.statuses.map((s) => s.value).join(', ')}]`,
  ]);
  const body = schema(decl.fields, [], f, '');
  return `formOf(${body}, [${rules.join(', ')}]${opts === undefined ? '' : `, ${opts}`})`;
}
