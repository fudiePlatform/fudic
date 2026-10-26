/**
 * What the two emitters share (SDD-60 §3.11, §4.3): the TS name of each piece, the TS type and
 * the wire descriptor of a `.fudapi` type, the middlewares a level ends up with, and how a name
 * of another file is reached.
 *
 * The emitters are lenient by construction: they run on what the validator may have rejected,
 * and a name that does not resolve becomes `unknown` (or text on the wire) instead of a throw.
 */

import type { Decl, FnDecl, Literal, LoadDecl, MiddlewareDecl, SkipClause, TypeExpr, UseClause } from '../ast.js';
import { GLOBAL_ID, type ApiIndex, type ApiSource, type ProjectKind } from '../index-api.js';
import { FLOATS, INTEGERS } from '../types-check.js';

/** `nif-unique` → `nifUnique`: a kebab name or code in TS. */
export const camel = (name: string): string => name.replace(/-([a-z0-9])/gu, (_, c: string) => c.toUpperCase());

/** `save` → `Save`, `nif-unique` → `NifUnique`: the prefix of a piece's types. */
export const pascal = (name: string): string => {
  const c = camel(name);
  return c.charAt(0).toUpperCase() + c.slice(1);
};

/** A JS string literal. */
export const str = (text: string): string => JSON.stringify(text);

/** What both emitters know: the file, its project and where it sits. */
export interface EmitCtx {
  readonly source: ApiSource;
  readonly index: ApiIndex;
  /** How a name exported by another `.fudapi` is written here. */
  readonly ref: (source: ApiSource, name: string) => string;
}

/** The TS name of a project declaration, reached from this file. */
export function projectRef(c: EmitCtx, kind: ProjectKind, name: string, ts = camel(name)): string | undefined {
  const found = c.index.lookup(kind, name);
  return found === undefined ? undefined : found.source === c.source ? ts : c.ref(found.source, ts);
}

/** The TS type of a value of `t`. */
export function tsType(t: TypeExpr, c: EmitCtx): string {
  switch (t.kind) {
    case 'list':
      return `readonly ${wrap(tsType(t.element, c))}[]`;
    case 'optional':
      return `${tsType(t.inner, c)} | undefined`;
    case 'map': {
      const key = t.key.kind === 'named' && t.key.name.text in INTEGERS ? 'number' : 'string';
      return `Readonly<Record<${key}, ${tsType(t.value, c)}>>`;
    }
    case 'named': {
      const name = t.name.text;
      if (name === 'str' || name === 'uuid') return 'string';
      if (name === 'bool') return 'boolean';
      if (name === 'date') return 'Date';
      if (name in INTEGERS || FLOATS.has(name)) return 'number';
      if (name === 'pattern') return 'RegExp';
      return projectRef(c, 'type', name, name) ?? 'unknown';
    }
  }
}

/** A type in a position where `[]` or `|` would bind wrong. */
const wrap = (ts: string): string => (ts.includes(' | ') || ts.startsWith('readonly ') ? `(${ts})` : ts);

/** `readonly name: T` or `readonly name?: T`, one per field. */
export function fieldsType(fields: readonly { readonly name: { readonly text: string }; readonly type: TypeExpr }[], c: EmitCtx): string {
  if (fields.length === 0) return '{}';
  const members = fields.map((f) =>
    f.type.kind === 'optional'
      ? `readonly ${f.name.text}?: ${tsType(f.type.inner, c)}`
      : `readonly ${f.name.text}: ${tsType(f.type, c)}`,
  );
  return `{ ${members.join('; ')} }`;
}

/** The wire descriptor of `t` (`Ty` of `@fudic/http/contract`). */
export function descriptor(t: TypeExpr, c: EmitCtx): string {
  switch (t.kind) {
    case 'list':
      return `{ list: ${descriptor(t.element, c)} }`;
    case 'optional':
      return `{ opt: ${descriptor(t.inner, c)} }`;
    case 'map':
      return `{ map: [${descriptor(t.key, c)}, ${descriptor(t.value, c)}] }`;
    case 'named': {
      const name = t.name.text;
      if (name === 'str' || name === 'uuid' || name === 'bool' || name === 'date' || name in INTEGERS || FLOATS.has(name)) return str(name);
      return projectRef(c, 'type', name, `$${name}`) ?? str('str');
    }
  }
}

/** `{ id: 'i32', name: 'str' }`: the descriptors of a list of fields. */
export const descriptors = (fields: readonly { readonly name: { readonly text: string }; readonly type: TypeExpr }[], c: EmitCtx): string =>
  `{ ${fields.map((f) => `${f.name.text}: ${descriptor(f.type, c)}`).join(', ')} }`;

/** A literal as a JS value. */
export function literal(lit: Literal): string {
  switch (lit.kind) {
    case 'string':
    case 'word':
      return str(lit.text);
    case 'number':
    case 'bool':
      return String(lit.value);
    case 'empty-list':
      return '[]';
  }
}

/** The clauses of a level in the order they were written. */
export const clauses = (uses: readonly UseClause[], skips: readonly SkipClause[]): readonly (UseClause | SkipClause)[] =>
  [...uses, ...skips].sort((a, b) => a.span.start - b.span.start);

/** The middlewares a function or `load` runs with: what it inherits, its skips, then its uses. */
export function effective(c: EmitCtx, level: FnDecl | LoadDecl): readonly string[] {
  let list = [...c.index.inherited(c.source, level)];
  for (const clause of clauses(level.uses, level.skips)) {
    if (clause.kind === 'use') list = [...list, ...clause.middlewares.map((m) => m.name.text)];
    else if (clause.all !== undefined) list = [];
    else list = list.filter((m) => !clause.middlewares.some((n) => n.text === m));
  }
  return list;
}

/** The middleware declarations of a list of names, those that resolve. */
export const middlewaresOf = (c: EmitCtx, names: readonly string[]): readonly { readonly decl: MiddlewareDecl; readonly source: ApiSource }[] =>
  names.flatMap((n) => {
    const found = c.index.lookup('middleware', n);
    return found === undefined ? [] : [found];
  });

/** The source whose `chain` is the global level, when it is not this one. */
export const globalChain = (c: EmitCtx): ApiSource | undefined => {
  const global = c.index.sources.find((s) => s.origin === 'app' && s.id === GLOBAL_ID);
  return global !== undefined && global !== c.source && global.file.declarations.some((d) => d.kind === 'chain') ? global : undefined;
};

/** Whether this file has its own `chain`. */
export const hasChain = (decls: readonly Decl[]): boolean => decls.some((d) => d.kind === 'chain');

/** `/** … *\/` from a declaration's documentation, indented. */
export function jsdoc(doc: string | undefined, indent: string): string {
  if (doc === undefined) return '';
  const lines = doc.replace(/\*\//gu, '*\\/').split('\n');
  return lines.length === 1 ? `${indent}/** ${lines[0]} */\n` : `${indent}/**\n${lines.map((l) => `${indent} * ${l}`).join('\n')}\n${indent} */\n`;
}

/** The parameters of the page whose sibling this is: `{ readonly slug: string }`. */
export const pageParams = (params: readonly string[]): string =>
  params.length === 0 ? '{}' : `{ ${params.map((p) => `readonly ${p}: string`).join('; ')} }`;

/**
 * The forms the functions of this file take that another file declares, by that file: the view
 * of a `.fud` that links this file gets them by name (SDD-60 §3.14), so this module re-exports
 * them. *Decided while implementing.*
 */
export function borrowedForms(c: EmitCtx): ReadonlyMap<ApiSource, readonly string[]> {
  const out = new Map<ApiSource, string[]>();
  for (const d of c.source.file.declarations) {
    if (d.kind !== 'fn' || d.form === undefined) continue;
    const found = c.index.lookup('form', d.form.name.text);
    if (found === undefined || found.source === c.source) continue;
    const names = out.get(found.source) ?? [];
    if (!names.includes(d.form.name.text)) names.push(d.form.name.text);
    out.set(found.source, names);
  }
  return out;
}
