/**
 * `validateApi`: what a `.fudapi` means against its project (SDD §4.2). The parser said whether
 * each line has its shape; this says whether each name exists, fits and is unique, whether each
 * declaration is where it may be, and whether a rule or a middleware is given what it takes.
 *
 * Every diagnostic sits on a name of this file, with `related` pointing at the declaration it
 * is about when there is one. It never throws, and a name it could not resolve is reported once
 * and not looked into further.
 */

import {
  FUD1080,
  FUD1081,
  FUD1082,
  FUD1086,
  FUD1087,
  FUD1088,
  FUD1090,
  FUD1091,
  FUD1093,
  FUD1096,
  FUD1097,
  FUD1099,
  FUD1100,
  FUD1101,
  FUD1010,
  type RelatedLocation,
  type SourceDiagnostic,
  type Span,
} from '@fudic/diagnostics';
import type {
  ChainDecl,
  Decl,
  FnDecl,
  FormMember,
  LoadDecl,
  MiddlewareArg,
  MiddlewareDecl,
  Name,
  RuleDecl,
  SkipClause,
  TypeDecl,
  TypedField,
  TypeExpr,
  UseClause,
} from './ast.js';
import { closest, type ApiIndex, type ApiSource, type Declared, type ProjectKind } from './index-api.js';
import { checkType, literalFits, PRIMITIVES } from './types-check.js';
import { checkArgRules, checkForm } from './validate-form.js';

/** What the host knows of the file and the parser cannot: where it sits. */
export interface ApiContext {
  /** Present when the file is the sibling of a route. */
  readonly route?: {
    /** The names of the route's parameters: `slug` for `blog/[slug]`. */
    readonly params: readonly string[];
    /** Its URL pattern, `/blog/:slug`: where the browser reads the page's params from. */
    readonly pattern?: string;
    /** The `_error` page. */
    readonly error?: boolean;
    /** The TS type of the props of its layout, from its `<link rel="layout">`. */
    readonly layoutProps?: string;
  };
}

interface Ctx {
  readonly source: ApiSource;
  readonly index: ApiIndex;
  readonly api: ApiContext;
  readonly out: SourceDiagnostic[];
}

export function validateApi(source: ApiSource, index: ApiIndex, api: ApiContext): readonly SourceDiagnostic[] {
  const c: Ctx = { source, index, api, out: [] };
  fileNames(source.file.declarations, c);
  for (const decl of source.file.declarations) declaration(decl, c);
  return c.out.sort((a, b) => a.span.start - b.span.start);
}

/** Where a declaration of another file is, as a related location. */
function relatedTo(found: Declared<{ readonly name: Name }>, c: Ctx, message: string): RelatedLocation {
  return {
    span: found.decl.name.span,
    message,
    ...(found.source === c.source ? {} : { file: found.source.path }),
  };
}

/** Reports every name of `names` after the first of its text (`FUD1082`). */
function unique(names: readonly Name[], where: string, c: Ctx): void {
  const first = new Map<string, Name>();
  for (const n of names) {
    const seen = first.get(n.text);
    if (seen === undefined) first.set(n.text, n);
    else c.out.push(FUD1082({ span: n.span, name: n.text, where, related: [{ span: seen.span, message: 'first here' }] }));
  }
}

/** Functions, forms and `load`/`paths`/`layout` are named once per file. */
function fileNames(decls: readonly Decl[], c: Ctx): void {
  const names: Name[] = [];
  for (const d of decls) {
    if (d.kind === 'fn' || d.kind === 'form') names.push(d.name);
    else if (d.kind === 'load' || d.kind === 'paths' || d.kind === 'layout') names.push({ text: d.kind, span: d.keyword });
  }
  unique(names, 'file', c);
}

/** A project name declared before, in this file or another (`FUD1081`). */
function projectName(kind: ProjectKind, decl: { readonly name: Name }, what: string, c: Ctx): void {
  const all = c.index.named(kind, decl.name.text);
  const first = all[0];
  if (first === undefined || first.decl === decl) return;
  c.out.push(FUD1081({ span: decl.name.span, name: decl.name.text, what, related: [relatedTo(first, c, 'declared here')] }));
}

function declaration(decl: Decl, c: Ctx): void {
  switch (decl.kind) {
    case 'fn':
      return fn(decl, c);
    case 'load':
      return load(decl, c);
    case 'paths':
      if (routeOnly(decl.keyword, 'paths', c)) {
        const route = c.api.route!;
        if (route.error === true) c.out.push(FUD1091({ span: decl.keyword, reason: 'error' }));
        else if (route.params.length === 0) c.out.push(FUD1091({ span: decl.keyword, reason: 'no-params' }));
      }
      return;
    case 'layout':
      routeOnly(decl.keyword, 'layout', c);
      return;
    case 'chain':
      return chain(decl, c);
    case 'type':
      projectName('type', decl, 'type', c);
      fields(decl.fields, `type ${decl.name.text}`, c);
      return cycles(decl, c);
    case 'enum':
      projectName('type', decl, 'type', c);
      return unique(decl.members, `enum ${decl.name.text}`, c);
    case 'form':
      projectName('form', decl, 'form', c);
      formNames(decl.fields, `form ${decl.name.text}`, c);
      return checkForm(decl, c.index, c.out);
    case 'messages': {
      const all = c.index.messages();
      const first = all[0]!;
      if (first.decl !== decl) {
        c.out.push(FUD1096({ span: decl.keyword, related: [{ span: first.decl.keyword, message: 'the first `messages`', ...(first.source === c.source ? {} : { file: first.source.path }) }] }));
      }
      return unique(decl.entries.map((e) => e.code), 'messages', c);
    }
    case 'rule':
      return rule(decl, c);
    case 'middleware':
      return middleware(decl, c);
    case 'pattern':
      return projectName('pattern', decl, 'pattern', c);
  }
}

/** Whether the file is the sibling of a route, reporting the declaration when not (`FUD1090`). */
function routeOnly(at: Span, keyword: string, c: Ctx): boolean {
  if (c.api.route !== undefined) return true;
  c.out.push(FUD1090({ span: at, keyword }));
  return false;
}

/** The types of typed fields, and their names once per block. */
function fields(list: readonly TypedField[], where: string, c: Ctx, scope: { readonly pattern?: boolean } = {}): void {
  for (const f of list) checkType(f.type, c.index, scope, c.out);
  unique(list.map((f) => f.name), where, c);
}

/** The names of a form's members, once per level. */
function formNames(list: readonly FormMember[], where: string, c: Ctx): void {
  unique(list.map((m) => m.name), where, c);
  for (const m of list) if (m.kind === 'form-group') formNames(m.fields, `group ${m.name.text}`, c);
}

/** The codes of the `fails` of one declaration, once each (`FUD1093`). */
function failCodes(list: readonly { readonly code: Name }[], c: Ctx): void {
  const first = new Map<string, Name>();
  for (const f of list) {
    const seen = first.get(f.code.text);
    if (seen === undefined) first.set(f.code.text, f.code);
    else c.out.push(FUD1093({ span: f.code.span, code: f.code.text, related: [{ span: seen.span, message: 'first here' }] }));
  }
}

function fn(decl: FnDecl, c: Ctx): void {
  const label = `${decl.verb} ${decl.name.text}`;
  // `_error` is painted with the error as its `data` and has no URL of its own (FUD1010).
  if (c.api.route?.error === true) c.out.push(FUD1010({ span: decl.name.span, name: decl.name.text }));
  for (const a of decl.args) {
    checkType(a.type, c.index, {}, c.out);
    checkArgRules(a, c.index, c.out);
  }
  unique(decl.args.map((a) => a.name), label, c);
  if (decl.returns !== undefined) checkType(decl.returns.type, c.index, {}, c.out);
  if (decl.form !== undefined && c.index.lookup('form', decl.form.name.text) === undefined) {
    const name = decl.form.name;
    c.out.push(FUD1080({ span: name.span, name: name.text, what: 'form', candidates: c.index.candidates('form', name.text) }));
  }
  middlewares(decl.uses, decl.skips, c.index.inherited(c.source, decl), c);
  failCodes(decl.fails, c);

  const args = new Set(decl.args.map((a) => a.name.text));
  for (const segment of decl.route?.segments ?? []) {
    if (segment.kind === 'param' && !args.has(segment.text)) c.out.push(FUD1099({ span: segment.span, param: segment.text }));
  }
  for (const a of decl.args) {
    if (a.place === 'body') continue;
    if (a.place === 'route' && c.api.route?.params.includes(a.name.text) === true) {
      c.out.push(FUD1100({ span: a.name.span, name: a.name.text }));
    }
    if (a.place === 'route' && a.type.kind === 'optional') {
      c.out.push(FUD1101({ span: a.type.span, name: a.name.text, problem: 'optional' }));
    } else if (!scalar(a.type.kind === 'optional' ? a.type.inner : a.type, c)) {
      c.out.push(FUD1101({ span: a.type.span, name: a.name.text, problem: 'scalar' }));
    }
  }
}

/** A type that is one value in a URL: a primitive or an `enum`. */
function scalar(type: TypeExpr, c: Ctx): boolean {
  if (type.kind !== 'named') return false;
  return PRIMITIVES.has(type.name.text) || c.index.lookup('type', type.name.text)?.decl.kind === 'enum';
}

function load(decl: LoadDecl, c: Ctx): void {
  routeOnly(decl.keyword, 'load', c);
  if (c.api.route?.error === true) c.out.push(FUD1010({ span: decl.keyword, name: 'load' }));
  fields(decl.fields, 'load', c);
  middlewares(decl.uses, decl.skips, c.index.inherited(c.source, decl), c);
  failCodes(decl.fails, c);
}

function chain(decl: ChainDecl, c: Ctx): void {
  middlewares(decl.uses, decl.skips, c.index.inherited(c.source, decl), c);
}

/** The middlewares a level uses and skips: they exist, take what they are given, and a skip has something to skip. */
function middlewares(uses: readonly UseClause[], skips: readonly SkipClause[], inherited: readonly string[], c: Ctx): void {
  for (const use of uses) {
    for (const ref of use.middlewares) {
      const found = known(ref.name, c);
      if (found !== undefined) middlewareArgs(ref.name, ref.args, found, c);
    }
  }
  for (const skip of skips) {
    for (const name of skip.middlewares) {
      if (known(name, c) !== undefined && !inherited.includes(name.text)) {
        c.out.push(FUD1086({ span: name.span, middleware: name.text }));
      }
    }
  }
}

/** The middleware a name refers to, or `undefined` having reported it (`FUD1080`). */
function known(name: Name, c: Ctx): MiddlewareDecl | undefined {
  const found = c.index.lookup('middleware', name.text);
  if (found === undefined) {
    c.out.push(FUD1080({ span: name.span, name: name.text, what: 'middleware', candidates: c.index.candidates('middleware', name.text) }));
  }
  return found?.decl;
}

/** The parameter lines under a `use` against the middleware's parameters (`FUD1087`). */
function middlewareArgs(name: Name, args: readonly MiddlewareArg[], decl: MiddlewareDecl, c: Ctx): void {
  const report = (span: Span, param: string, problem: 'missing' | 'extra' | 'type'): void => {
    c.out.push(FUD1087({ span, middleware: name.text, param, problem }));
  };
  const given = new Set<string>();
  for (const arg of args) {
    const param = decl.params.find((p) => p.name.text === arg.name.text);
    const isMap = param?.type.kind === 'map';
    if (param === undefined || (given.has(arg.name.text) && !isMap)) {
      report(arg.name.span, arg.name.text, 'extra');
      continue;
    }
    given.add(arg.name.text);
    if (!argFits(arg, param.type, c)) report(arg.name.span, arg.name.text, 'type');
  }
  for (const p of decl.params) {
    if (p.type.kind !== 'optional' && !given.has(p.name.text)) report(name.span, p.name.text, 'missing');
  }
}

/**
 * One parameter line against its type: a map takes a key and a value, a list any number of its
 * elements (or `[]`, or nothing), the rest one value.
 */
function argFits(arg: MiddlewareArg, type: TypeExpr, c: Ctx): boolean {
  const values = arg.values;
  if (type.kind === 'map') {
    return values.length === 2 && literalFits(values[0]!, type.key, c.index) && literalFits(values[1]!, type.value, c.index);
  }
  const inner = type.kind === 'optional' ? type.inner : type;
  if (inner.kind === 'list') {
    const empty = values.length === 1 && values[0]!.kind === 'empty-list';
    return empty || values.every((v) => literalFits(v, inner.element, c.index));
  }
  return values.length === 1 && literalFits(values[0]!, inner, c.index);
}

/** A type that holds itself through required fields only (`FUD1088`). */
function cycles(decl: TypeDecl, c: Ctx): void {
  const seen = new Set<TypeDecl>();
  const walk = (current: TypeDecl, path: readonly string[]): readonly string[] | undefined => {
    for (const f of current.fields) {
      if (f.type.kind !== 'named') continue;
      const next = c.index.lookup('type', f.type.name.text)?.decl;
      if (next?.kind !== 'type') continue;
      if (next === decl) return [...path, next.name.text];
      if (seen.has(next)) continue;
      seen.add(next);
      const found = walk(next, [...path, next.name.text]);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  const cycle = walk(decl, [decl.name.text]);
  if (cycle !== undefined) c.out.push(FUD1088({ span: decl.name.span, type: decl.name.text, cycle: cycle.join(' → ') }));
}

function rule(decl: RuleDecl, c: Ctx): void {
  projectName('rule', decl, 'rule', c);
  if (decl.on === undefined) c.out.push(FUD1097({ span: decl.name.span, rule: decl.name.text, missing: 'on' }));
  if (decl.runs === undefined) c.out.push(FUD1097({ span: decl.name.span, rule: decl.name.text, missing: 'runs' }));
  if (decl.fails.length === 0) c.out.push(FUD1097({ span: decl.name.span, rule: decl.name.text, missing: 'fails' }));
  for (const t of decl.on?.types ?? []) checkType(t, c.index, { any: true }, c.out);
  fields(decl.params, `rule ${decl.name.text}`, c, { pattern: true });
  failCodes(decl.fails, c);
  const params = decl.params.map((p) => p.name.text);
  for (const f of decl.fails) {
    for (const p of f.params) {
      if (!params.includes(p.text)) {
        c.out.push(FUD1080({ span: p.span, name: p.text, what: 'parameter', candidates: closest(p.text, params) }));
      }
    }
  }
}

function middleware(decl: MiddlewareDecl, c: Ctx): void {
  projectName('middleware', decl, 'middleware', c);
  fields(decl.params, `middleware ${decl.name.text}`, c);
  if (decl.adds !== undefined) fields(decl.adds.fields, 'adds', c);
  failCodes(decl.fails, c);
}
