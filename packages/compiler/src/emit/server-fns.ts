/**
 * The server functions of a `@server`, read at compile time (SDD-56 §3.11, §4.5).
 *
 * The client has to know which `.client` halves to import without running a line of the
 * `@server`, so the chain of every function — and the file's own level, `export const http` —
 * is read off the AST the file's single Oxc batch already produced. Nothing is executed:
 *
 * - **a function** is `export const X = <verb>()…handle(…)`, with any number of `.use`, `.skip`,
 *   `.args`, `.form`, `.invalidates` and `.compress`, or a base kept in a `const` of the same
 *   `@server` and continued;
 * - **the file's level** is `export const http = chain()…`;
 * - **`load`** is a function too: fluent, or the `export function load` it always was.
 *
 * What cannot be read that way is a diagnostic with its span, and the rest of the file is still
 * read: the parser never throws.
 */

import {
  FUD1000,
  FUD1001,
  FUD1002,
  FUD1003,
  FUD1004,
  FUD1007,
  FUD1008,
  FUD1009,
  FUD1010,
} from '@fudic/diagnostics';
import { patternNames, type OxcNode } from '../oxc/index.js';
import type { Diagnostic, Span } from '../types/index.js';
import { freeReferenceNodes } from './scope.js';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** `.compress(…)` as written: `false`, or the literal options. */
export type CompressLiteral = false | { readonly format: string; readonly min?: number };

export interface MiddlewareRef {
  /** The identifier as written. */
  readonly local: string;
  /** The module it is imported from, as written; absent when declared in this `@server`. */
  readonly from?: string;
  /** The name it is imported under there: `default` for a default import. */
  readonly imported?: string;
  readonly span: Span;
}

export type ChainStep =
  | { readonly kind: 'use'; readonly refs: readonly MiddlewareRef[] }
  | { readonly kind: 'skip'; readonly refs: readonly MiddlewareRef[] }
  | { readonly kind: 'skip-all' };

export type FnOwner =
  | { readonly kind: 'route'; readonly pattern: string }
  | { readonly kind: 'component'; readonly tag: string };

/** One server function, without its owner: who owns it is the caller's to say. */
export interface ServerFnRead {
  /** `save`, or `load`. */
  readonly name: string;
  readonly method: Method;
  /** Its own chain, in order, as written. */
  readonly steps: readonly ChainStep[];
  /** The identifier given to `.form(…)`, with its import. */
  readonly form?: MiddlewareRef;
  readonly invalidates: readonly string[];
  /** Its own `.compress(…)`; absent when it writes none. */
  readonly compress?: CompressLiteral;
  readonly span: Span;
}

export interface ServerFnMeta extends ServerFnRead {
  readonly owner: FnOwner;
}

/** One file: its `http` chain and its functions. */
export interface ServerFnTable {
  readonly file: readonly ChainStep[];
  readonly fileCompress?: CompressLiteral;
  readonly fns: readonly ServerFnMeta[];
}

/** What `extractCode` keeps of a `@server`: the table without owner, and its machinery. */
export interface ServerFns {
  readonly file: readonly ChainStep[];
  readonly fileCompress?: CompressLiteral;
  readonly fns: readonly ServerFnRead[];
  /**
   * The top-level statements that ARE the machinery: every function, `http`, every base and
   * every middleware declared here. A component's `?server` module is these and their imports;
   * its `render()` is everything else (§4.13).
   */
  readonly machinery: ReadonlySet<OxcNode>;
}

export const NO_SERVER_FNS: ServerFns = { file: [], fns: [], machinery: new Set() };

/** Attaches the owner: the route's pattern or the component's tag. */
export function serverFnTable(fns: ServerFns, owner: FnOwner): ServerFnTable {
  return {
    file: fns.file,
    ...(fns.fileCompress !== undefined ? { fileCompress: fns.fileCompress } : {}),
    fns: fns.fns.map((fn) => ({ ...fn, owner })),
  };
}

export interface ReadInput {
  /** The top-level statements of the `@server` regions, in source order. */
  readonly server: readonly OxcNode[];
  /** Every top-level statement of `@code`, for its imports. */
  readonly all: readonly OxcNode[];
  /** Buffer offset → `.fud` offset. */
  readonly map: (offset: number) => number;
  /** The top-level names of `@client` and of the neutral zone (`FUD1009`). */
  readonly browserNames: ReadonlySet<string>;
  /** A component reads only module-wide names (`FUD1008`); a route reads anything. */
  readonly component: boolean;
  /** `_error.fud`, which declares none of this (`FUD1010`). */
  readonly errorPage: boolean;
}

const HTTP = '@fudic/http';
const VERBS: Readonly<Record<string, Method>> = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  del: 'DELETE',
};
const RESERVED = new Set(['paths', 'layout', 'http']);

const field = (node: OxcNode, key: string): OxcNode | undefined =>
  node[key] as OxcNode | undefined;
/** An array field Oxc always writes (`arguments`, `declarations`, `properties`, `specifiers`). */
const list = (node: OxcNode, key: string): OxcNode[] => node[key] as OxcNode[];
const nameOf = (node: OxcNode): string => String(node['name']);
const isIdent = (node: OxcNode | undefined): node is OxcNode => node?.type === 'Identifier';
const isString = (node: OxcNode | undefined): node is OxcNode =>
  node?.type === 'Literal' && typeof node['value'] === 'string';

/** What a chain grows from. */
type Root =
  | { readonly kind: 'verb'; readonly method: Method }
  | { readonly kind: 'chain' }
  | { readonly kind: 'middleware' }
  | { readonly kind: 'base'; readonly name: string }
  | { readonly kind: 'unknown' };

interface Call {
  readonly method: string;
  readonly args: readonly OxcNode[];
}

/** A builder read so far: what a base hands to whoever continues it. */
interface Built {
  readonly method: Method;
  readonly steps: readonly ChainStep[];
  readonly form?: MiddlewareRef;
  readonly invalidates: readonly string[];
  readonly compress?: CompressLiteral;
  readonly closed: boolean;
}

/** One top-level `const` of the `@server`. */
interface Declared {
  readonly name: string;
  readonly id: OxcNode;
  readonly init: OxcNode;
  readonly statement: OxcNode;
  readonly exported: boolean;
}

export function readServerFns(input: ReadInput): { fns: ServerFns; diagnostics: Diagnostic[] } {
  const { map } = input;
  const out: Diagnostic[] = [];
  const spanOf = (node: OxcNode): Span => ({ start: map(node.start), end: map(node.end) });
  const imports = importTable(input.all);
  const roots = rootNames(imports);

  const declared = declarations(input.server);
  const locals = new Map(declared.map((d) => [d.name, d]));
  const built = new Map<string, Built | null>();
  const machinery = new Set<OxcNode>();
  const fns: ServerFnRead[] = [];
  let file: readonly ChainStep[] = [];
  let fileCompress: CompressLiteral | undefined;

  const ref = (node: OxcNode): MiddlewareRef => {
    const local = nameOf(node);
    const imported = imports.get(local);
    return imported === undefined
      ? { local, span: spanOf(node) }
      : { local, from: imported.from, imported: imported.name, span: spanOf(node) };
  };

  const unreadable = (node: OxcNode, what: string): void => {
    out.push(FUD1000({ span: spanOf(node), what }));
  };

  /** The `.use` / `.skip` / `.compress` steps of a chain, into `steps`. */
  const chainStep = (call: Call, at: OxcNode, steps: ChainStep[]): CompressLiteral | undefined => {
    if (call.method === 'use' || call.method === 'skip') {
      if (call.method === 'skip' && call.args.length === 1 && isString(call.args[0]) && call.args[0]['value'] === '*') {
        steps.push({ kind: 'skip-all' });
        return undefined;
      }
      const refs: MiddlewareRef[] = [];
      for (const arg of call.args) {
        if (isIdent(arg)) refs.push(ref(arg));
        else unreadable(arg, `the argument of \`.${call.method}\``);
      }
      steps.push({ kind: call.method, refs });
      return undefined;
    }
    if (call.method === 'compress') return compressOf(call.args[0] ?? at, unreadable);
    return undefined;
  };

  /** A builder `const`, read once and remembered: a base is read for every continuation. */
  const build = (d: Declared): Built | null => {
    if (built.has(d.name)) return built.get(d.name)!;
    built.set(d.name, null); // a base that continues itself is a cycle, and reads as nothing
    const { root, calls } = unwind(d.init, roots);
    let base: Built | null = null;
    if (root.kind === 'verb') {
      base = { method: root.method, steps: [], invalidates: [], closed: false };
    } else if (root.kind === 'base') {
      const from = locals.get(root.name);
      base = from === undefined ? null : build(from);
    }
    if (base === null) return null;

    const steps = [...base.steps];
    let form = base.form;
    const invalidates = [...base.invalidates];
    let compress = base.compress;
    let closed = base.closed;
    for (const call of calls) {
      if (call.method === 'form') {
        const arg = call.args[0];
        if (isIdent(arg)) form = ref(arg);
        else unreadable(arg ?? d.init, 'the argument of `.form`');
      } else if (call.method === 'invalidates') {
        for (const arg of call.args) {
          if (isString(arg)) invalidates.push(String(arg['value']));
          else unreadable(arg, 'an argument of `.invalidates`');
        }
      } else if (call.method === 'handle') {
        closed = true;
      } else {
        const set = chainStep(call, d.init, steps);
        if (set !== undefined || call.method === 'compress') compress = set;
      }
    }
    const result: Built = {
      method: base.method,
      steps,
      invalidates,
      closed,
      ...(form !== undefined ? { form } : {}),
      ...(compress !== undefined ? { compress } : {}),
    };
    built.set(d.name, result);
    return result;
  };

  for (const d of declared) {
    const { root, calls } = unwind(d.init, roots);
    if (root.kind === 'middleware') {
      machinery.add(d.statement);
      if (calls.some((c) => c.method === 'client')) out.push(FUD1007({ span: spanOf(d.id), name: d.name }));
      continue;
    }
    if (d.name === 'http' && d.exported) {
      machinery.add(d.statement);
      if (root.kind !== 'chain' || calls.some((c) => c.method === 'handle')) {
        out.push(FUD1004({ span: spanOf(d.init) }));
        continue;
      }
      const steps: ChainStep[] = [];
      for (const call of calls) {
        const set = chainStep(call, d.init, steps);
        if (call.method === 'compress' && set !== undefined) fileCompress = set;
      }
      file = steps;
      continue;
    }
    if (root.kind === 'chain') {
      machinery.add(d.statement);
      continue;
    }
    if (root.kind === 'unknown') {
      // Not a builder this compiler can follow. Only worth a word when it is plainly meant as a
      // server function: an exported expression that ends in `.handle(…)` somewhere.
      if (d.exported && closesWithHandle(d.init)) unreadable(d.init, 'the verb or the base of this chain');
      continue;
    }
    const fn = build(d);
    if (fn === null) {
      if (d.exported && closesWithHandle(d.init)) unreadable(d.init, 'the verb or the base of this chain');
      continue;
    }
    machinery.add(d.statement);
    if (!d.exported) continue; // a base: read when continued
    if (!fn.closed) {
      out.push(FUD1001({ span: spanOf(d.id), name: d.name }));
      continue;
    }
    if (RESERVED.has(d.name)) {
      out.push(FUD1003({ span: spanOf(d.id), name: d.name }));
      continue;
    }
    if (d.name === 'load' && fn.method !== 'GET') {
      out.push(FUD1002({ span: spanOf(d.id), verb: verbName(fn.method) }));
    }
    fns.push({
      name: d.name,
      method: fn.method,
      steps: fn.steps,
      invalidates: fn.invalidates,
      span: spanOf(d.id),
      ...(fn.form !== undefined ? { form: fn.form } : {}),
      ...(fn.compress !== undefined ? { compress: fn.compress } : {}),
    });
  }

  // `export function load(ctx)`: a function too, with nothing of its own in the chain.
  for (const stmt of input.server) {
    const fn = exportedFunction(stmt, 'load');
    if (fn !== undefined) {
      fns.push({ name: 'load', method: 'GET', steps: [], invalidates: [], span: spanOf(fn) });
    }
  }

  for (const fn of fns) {
    if (fn.name !== 'load' && input.browserNames.has(fn.name)) {
      out.push(FUD1009({ span: fn.span, name: fn.name }));
    }
  }

  if (input.component) {
    // A function has no instance: it reads imports and the machinery, and nothing else.
    const moduleWide = new Set<string>([...imports.keys(), ...[...locals.values()].filter((d) => machinery.has(d.statement)).map((d) => d.name)]);
    const instance = new Set(serverNames(input.server).filter((name) => !moduleWide.has(name)));
    for (const d of declared) {
      if (!machinery.has(d.statement)) continue;
      for (const node of freeReferenceNodes([d.init])) {
        if (instance.has(nameOf(node))) out.push(FUD1008({ span: spanOf(node), name: nameOf(node) }));
      }
    }
  }

  if (input.errorPage) {
    for (const fn of fns) out.push(FUD1010({ span: fn.span, name: fn.name }));
    for (const stmt of input.server) {
      const paths = exportedFunction(stmt, 'paths');
      if (paths !== undefined) out.push(FUD1010({ span: spanOf(paths), name: 'paths' }));
    }
  }

  return {
    fns: { file, fns, machinery, ...(fileCompress !== undefined ? { fileCompress } : {}) },
    diagnostics: out,
  };
}

/** `false`, or an object literal of literals: what `.compress(…)` may be given. */
function compressOf(arg: OxcNode, unreadable: (node: OxcNode, what: string) => void): CompressLiteral | undefined {
  if (arg.type === 'Literal' && arg['value'] === false) return false;
  if (arg.type === 'ObjectExpression') {
    let format: string | undefined;
    let min: number | undefined;
    let literal = true;
    for (const prop of list(arg, 'properties')) {
      const key = field(prop, 'key');
      const value = field(prop, 'value');
      const name = isIdent(key) ? nameOf(key) : isString(key) ? String(key['value']) : undefined;
      if (name === 'format' && isString(value)) format = String(value['value']);
      else if (name === 'min' && value?.type === 'Literal' && typeof value['value'] === 'number') min = value['value'];
      else literal = false;
    }
    if (literal && format !== undefined) return min === undefined ? { format } : { format, min };
  }
  unreadable(arg, 'the argument of `.compress`');
  return undefined;
}

/** A chain unwound: what it grows from, and the calls after it in the order they are written. */
function unwind(expr: OxcNode, roots: ReadonlyMap<string, Root>): { root: Root; calls: Call[] } {
  const calls: Call[] = [];
  let node = expr;
  for (;;) {
    if (node.type === 'CallExpression') {
      const callee = field(node, 'callee')!;
      if (callee.type === 'MemberExpression' && callee['computed'] !== true && isIdent(field(callee, 'property'))) {
        calls.unshift({ method: nameOf(field(callee, 'property')!), args: list(node, 'arguments') });
        node = field(callee, 'object')!;
        continue;
      }
      if (isIdent(callee)) return { root: roots.get(nameOf(callee)) ?? { kind: 'unknown' }, calls };
      return { root: { kind: 'unknown' }, calls };
    }
    if (isIdent(node)) return { root: { kind: 'base', name: nameOf(node) }, calls };
    return { root: { kind: 'unknown' }, calls };
  }
}

/** Whether `.handle(…)` is called anywhere in the expression. */
function closesWithHandle(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(closesWithHandle);
  if (node === null || typeof node !== 'object') return false;
  const current = node as OxcNode;
  if (current.type === 'CallExpression') {
    const callee = field(current, 'callee');
    const property = callee?.type === 'MemberExpression' ? field(callee, 'property') : undefined;
    if (isIdent(property) && nameOf(property) === 'handle') return true;
  }
  return Object.values(current).some(closesWithHandle);
}

/** The local names `@fudic/http`'s builders were imported under, and what each one opens. */
function rootNames(imports: ReadonlyMap<string, { from: string; name: string }>): Map<string, Root> {
  const roots = new Map<string, Root>();
  for (const [local, { from, name }] of imports) {
    if (from !== HTTP) continue;
    const method = VERBS[name];
    if (method !== undefined) roots.set(local, { kind: 'verb', method });
    else if (name === 'chain') roots.set(local, { kind: 'chain' });
    else if (name === 'middleware') roots.set(local, { kind: 'middleware' });
  }
  return roots;
}

/** Local name → the module and the name it was imported from. Namespace imports bind nothing here. */
function importTable(statements: readonly OxcNode[]): Map<string, { from: string; name: string }> {
  const table = new Map<string, { from: string; name: string }>();
  for (const stmt of statements) {
    if (stmt.type !== 'ImportDeclaration' || stmt['importKind'] === 'type') continue;
    const from = String(field(stmt, 'source')!['value']);
    for (const spec of list(stmt, 'specifiers')) {
      const local = nameOf(field(spec, 'local')!);
      if (spec.type === 'ImportSpecifier') {
        const imported = field(spec, 'imported')!;
        table.set(local, { from, name: isIdent(imported) ? nameOf(imported) : String(imported['value']) });
      } else if (spec.type === 'ImportDefaultSpecifier') {
        table.set(local, { from, name: 'default' });
      }
    }
  }
  return table;
}

/** Every top-level `const`/`let` of the `@server`, exported or not. */
function declarations(statements: readonly OxcNode[]): Declared[] {
  const out: Declared[] = [];
  for (const stmt of statements) {
    const exported = stmt.type === 'ExportNamedDeclaration';
    const decl = exported ? field(stmt, 'declaration') : stmt;
    if (decl?.type !== 'VariableDeclaration') continue;
    for (const d of list(decl, 'declarations')) {
      const id = field(d, 'id');
      const init = field(d, 'init');
      if (!isIdent(id) || init === undefined || init === null) continue;
      out.push({ name: nameOf(id), id, init, statement: stmt, exported });
    }
  }
  return out;
}

/**
 * Every name the `@server` declares at its top level, exported or not, functions included —
 * a destructuring declares each of its names.
 */
function serverNames(statements: readonly OxcNode[]): string[] {
  const names: string[] = [];
  for (const stmt of statements) {
    const decl = stmt.type === 'ExportNamedDeclaration' ? field(stmt, 'declaration') : stmt;
    if (decl?.type === 'VariableDeclaration') {
      for (const d of list(decl, 'declarations')) names.push(...patternNames(field(d, 'id')));
    } else if (decl?.type === 'FunctionDeclaration' || decl?.type === 'ClassDeclaration') {
      // A declaration at the top level of a module always has its name.
      names.push(nameOf(field(decl, 'id')!));
    }
  }
  return names;
}

/** The identifier of `export function <name>`, when `stmt` is one. */
function exportedFunction(stmt: OxcNode, name: string): OxcNode | undefined {
  if (stmt.type !== 'ExportNamedDeclaration') return undefined;
  const decl = field(stmt, 'declaration');
  if (decl?.type !== 'FunctionDeclaration') return undefined;
  const id = field(decl, 'id');
  return isIdent(id) && nameOf(id) === name ? id : undefined;
}

/** `'DELETE'` → `del`, the name the developer wrote. */
function verbName(method: Method): string {
  return Object.keys(VERBS).find((k) => VERBS[k] === method)!;
}
