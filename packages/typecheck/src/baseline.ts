/**
 * The TS detector of Baseline (SDD-83 §3.6, §4.5): what the code that runs in the browser uses of
 * it — the `@code` of a `.fud`, and the project's modules the browser loads.
 *
 * WHERE comes from Oxc, as everywhere else in fudic: each member access, call, `new` and global name
 * of the code, and the guard around it, read over the tree the batch already holds. WHAT each one is
 * comes from the checker: a node's span crosses into the program (through the projection's mappings
 * for a `.fud`, as it is for a `.ts`) and the node with exactly that span is asked its symbol. Only
 * what the `lib` of TypeScript declares is the browser's; a method of the author or of a package with
 * the same name is not.
 *
 * - `el.showPopover()` is `api.<type of el>.showPopover`, then its base types, then the interface
 *   that declares it; `Promise.withResolvers()` is `javascript.builtins.Promise.withResolvers`
 *   (`PromiseConstructor` reads as `Promise`).
 * - A global name is `api.<name>`, `api.Window.<name>` or `javascript.builtins.<name>`; after `new`,
 *   its constructor first (`api.URLPattern.URLPattern`).
 * - `addEventListener('beforetoggle', …)` is `api.<type>.beforetoggle_event`.
 *
 * Guarded, and not reported: in the true branch of an `if`, a `?:` or an `&&` whose condition tests
 * the name (`'showPopover' in el`, `typeof URLPattern === 'function'`, `typeof X !== 'undefined'`,
 * `el.showPopover !== undefined`, `el.showPopover`), inside that very condition, after an
 * `if (!test) return` or `throw` in an enclosing block, or called optionally (`el.showPopover?.()`).
 *
 * Syntax is not looked at: Vite lowers it to its `build.target`. Type-only import of `typescript`,
 * as in `portable-types`: the language server bundles this file and the program may come from
 * another copy.
 */

import type * as ts from 'typescript';
import { JsBatch, judgeUses, type BaselineContext, type BaselineUse, type OxcNode, type Span } from '@fudic/compiler';
import { firstKnown } from '@fudic/baseline';
import type { SourceDiagnostic } from '@fudic/diagnostics';
import { generatedRange } from './portable-types.js';
import type { ProjectedFud } from './project.js';

/** Every `FUD1524` of the `@code` of `document`, on the `.fud`. */
export function fudBaselineDiagnostics(
  program: ts.Program,
  document: ProjectedFud,
  context: BaselineContext,
): readonly SourceDiagnostic[] {
  return judgeUses(fudBaselineUses(program, document), context);
}

/** What the `@code` of `document` uses of the browser, unguarded, with its spans on the `.fud`. */
export function fudBaselineUses(program: ts.Program, document: ProjectedFud): readonly BaselineUse[] {
  const file = program.getSourceFile(document.path);
  const client = document.virtuals.find((virtual) => virtual.languageId !== 'css');
  if (file === undefined || client === undefined) return [];
  const js = document.js.result;
  const statements = document.js.code.flatMap((id) => js.ast(id) as readonly OxcNode[]);
  const site: Site = { program, file, at: (span) => generatedRange(client.mappings, span), source: js.mapSpan };
  return new Detector(site).uses(statements);
}

/** Every `FUD1524` of the module `fileName` of the program, on it. */
export function moduleBaselineDiagnostics(
  program: ts.Program,
  fileName: string,
  context: BaselineContext,
): readonly SourceDiagnostic[] {
  return judgeUses(moduleBaselineUses(program, fileName), context);
}

/** What the module `fileName` of the program uses of the browser, unguarded. */
export function moduleBaselineUses(program: ts.Program, fileName: string): readonly BaselineUse[] {
  const file = program.getSourceFile(fileName);
  if (file === undefined) return [];
  const batch = new JsBatch(file.text);
  const id = batch.add('module-statements', { start: 0, end: file.text.length });
  const js = batch.parse().value;
  const site: Site = { program, file, at: (span) => [span.start, span.end], source: js.mapSpan };
  return new Detector(site).uses(js.ast(id) as readonly OxcNode[]);
}

/**
 * The project's modules the browser loads (§3.6): those `roots` import, directly or not, that live
 * under `root`, outside `node_modules` and outside `server` (they run in Node), and are TypeScript
 * or JavaScript of their own — a `.fud` is judged as a `.fud`. `roots` themselves are included when
 * they are such modules.
 */
export function browserModules(
  typescript: typeof ts,
  program: ts.Program,
  roots: readonly string[],
  root: string,
  server: string,
): readonly string[] {
  const options = program.getCompilerOptions();
  // `node_modules` inside `root`, not above it: a library installed in the app is a root of its own.
  const own = (path: string): boolean =>
    path.startsWith(`${root}/`) &&
    !path.slice(root.length).includes('/node_modules/') &&
    !path.startsWith(`${server}/`) &&
    /\.[cm]?[jt]s$/u.test(path) &&
    !/\.d\.[cm]?ts$/u.test(path);
  const found = new Set<string>();
  const pending = [...roots];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const file = program.getSourceFile(next);
    if (file === undefined) continue;
    if (own(next)) found.add(next);
    for (const statement of file.statements) {
      const specifier = (statement as { readonly moduleSpecifier?: { readonly text?: string } }).moduleSpecifier?.text;
      if (specifier === undefined) continue;
      const resolved = typescript.resolveModuleName(specifier, next, options, typescript.sys).resolvedModule;
      const path = resolved?.resolvedFileName.replace(/\\/gu, '/');
      if (path !== undefined && own(path) && !found.has(path)) pending.push(path);
    }
  }
  return [...found].sort();
}

/** Where the detector reads: the program's file, and how a span of the code crosses into it. */
interface Site {
  readonly program: ts.Program;
  readonly file: ts.SourceFile;
  /** The generated range of a span of the source; undefined when it was not copied as written. */
  at(span: Span): readonly [number, number] | undefined;
  /** An Oxc buffer range as a span of the source. */
  source(start: number, end: number): Span;
}

/** `ts.SymbolFlags`: `FunctionScopedVariable | BlockScopedVariable | Function | Class`, shared by 5.x and 6.x. */
const VALUE = 1 | 2 | 16 | 32;
/** A name that can be a segment of a key. */
const IDENT = /^(?!__)[A-Za-z_$][\w$]*$/u;
/** The keys of an Oxc node that hold types, not code. */
const TYPE_KEYS: ReadonlySet<string> = new Set(['typeAnnotation', 'typeParameters', 'typeArguments', 'returnType', 'superTypeArguments']);
/** The declarations that hold no code of the browser. */
const TYPE_ONLY: ReadonlySet<string> = new Set([
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'TSModuleDeclaration',
  'TSDeclareFunction',
  'ImportDeclaration',
]);

class Detector {
  readonly #checker: ts.TypeChecker;
  readonly #out: BaselineUse[] = [];

  constructor(private readonly site: Site) {
    this.#checker = site.program.getTypeChecker();
  }

  uses(statements: readonly OxcNode[]): BaselineUse[] {
    const root: OxcNode = { type: 'Program', start: 0, end: 0, body: statements };
    for (const statement of statements) this.#visit(statement, [root]);
    return this.#out;
  }

  #visit(node: OxcNode, ancestors: readonly OxcNode[]): void {
    if (TYPE_ONLY.has(node.type)) return;
    const parent = ancestors[ancestors.length - 1]!;
    if (node.type === 'MemberExpression') this.#member(node, parent, ancestors);
    else if (node.type === 'Identifier') this.#global(node, parent, ancestors);
    const inner = [...ancestors, node];
    for (const [key, value] of Object.entries(node)) {
      if (TYPE_KEYS.has(key)) continue;
      for (const child of Array.isArray(value) ? value : [value]) {
        if (isNode(child)) this.#visit(child, inner);
      }
    }
  }

  // ── What a node reads as ──

  /** `object.name`: the member, and the event an `addEventListener` names. */
  #member(node: OxcNode, parent: OxcNode, ancestors: readonly OxcNode[]): void {
    const property = node['property'] as OxcNode;
    if (node['computed'] === true || property.type !== 'Identifier') return;
    const name = property['name'] as string;
    const found = this.#symbol(property);
    if (found === undefined || !this.#fromLibrary(found.symbol) || this.#guarded(node, name, ancestors)) return;
    const types = this.#typeNames((found.at.parent as ts.PropertyAccessExpression).expression);
    // `#fromLibrary` asked for at least one declaration.
    const declaring = found.symbol.declarations!.map((d) => (d.parent as { readonly name?: ts.Identifier }).name?.text);
    const names = [...new Set([...types, ...declaring].flatMap((n) => (n === undefined ? [] : [readAs(n)])))];
    const key = firstKnown([...names.map((n) => `api.${n}.${name}`), ...names.map((n) => `javascript.builtins.${n}.${name}`)]);
    if (key !== undefined) this.#use(name, key, property);
    const event = (parent['arguments'] as readonly OxcNode[] | undefined)?.[0];
    if (name !== 'addEventListener' || parent.type !== 'CallExpression' || parent['callee'] !== node) return;
    if (event?.type !== 'Literal' || typeof event['value'] !== 'string') return;
    const eventKey = firstKnown(types.map((n) => `api.${readAs(n)}.${event['value'] as string}_event`));
    if (eventKey !== undefined) this.#use(`'${event['value'] as string}'`, eventKey, event);
  }

  /** A name of the global scope the `lib` declares: `requestIdleCallback`, `URLPattern`. */
  #global(node: OxcNode, parent: OxcNode, ancestors: readonly OxcNode[]): void {
    // A member's name and an object's key are not references; the checker tells the rest.
    if ((parent.type === 'MemberExpression' && parent['property'] === node) || (parent.type === 'Property' && parent['key'] === node)) {
      return;
    }
    const found = this.#symbol(node);
    if (found === undefined || (found.symbol.flags & VALUE) === 0 || !this.#fromLibrary(found.symbol)) return;
    const name = node['name'] as string;
    const constructed = parent.type === 'NewExpression' && parent['callee'] === node;
    const candidates = constructed
      ? [`api.${name}.${name}`, `javascript.builtins.${name}.${name}`, `api.${name}`, `javascript.builtins.${name}`]
      : [`api.${name}`, `api.Window.${name}`, `javascript.builtins.${name}`];
    const key = firstKnown(candidates);
    if (key !== undefined && !this.#guarded(node, name, ancestors)) this.#use(name, key, node);
  }

  #use(name: string, key: string, node: OxcNode): void {
    this.#out.push({ name, key, span: this.site.source(node.start, node.end) });
  }

  // ── The checker ──

  /** The node of the program written exactly where `node` is. */
  #tsNode(node: OxcNode): ts.Node | undefined {
    const range = this.site.at(this.site.source(node.start, node.end));
    if (range === undefined) return undefined;
    const [start, end] = range;
    const file = this.site.file;
    let found: ts.Node | undefined;
    const visit = (candidate: ts.Node): void => {
      if (candidate.getStart(file) > start || candidate.getEnd() < end) return;
      if (candidate.getStart(file) === start && candidate.getEnd() === end) found = candidate;
      candidate.forEachChild(visit);
    };
    file.forEachChild(visit);
    return found;
  }

  /** The node of the program at `node` and its symbol; undefined when either is missing. */
  #symbol(node: OxcNode): { readonly at: ts.Node; readonly symbol: ts.Symbol } | undefined {
    const at = this.#tsNode(node);
    const symbol = at === undefined ? undefined : this.#checker.getSymbolAtLocation(at);
    return symbol === undefined ? undefined : { at: at!, symbol };
  }

  /** Whether every declaration of `symbol` is in the `lib` of TypeScript: the browser's, not a package's. */
  #fromLibrary(symbol: ts.Symbol): boolean {
    const declarations = symbol.declarations ?? [];
    return declarations.length > 0 && declarations.every((d) => this.site.program.isSourceFileDefaultLibrary(d.getSourceFile()));
  }

  /** The names of the type of `receiver` and of its base types: `HTMLDivElement`, `HTMLElement`, `Element`… */
  #typeNames(receiver: ts.Node): string[] {
    const names: string[] = [];
    const seen = new Set<ts.Symbol>();
    const add = (type: ts.Type): void => {
      for (const part of type.isUnionOrIntersection() ? type.types : [type]) {
        const symbol = part.getSymbol();
        if (symbol === undefined || seen.has(symbol)) continue;
        seen.add(symbol);
        if (IDENT.test(symbol.name)) names.push(symbol.name);
        if (part.isClassOrInterface()) for (const base of this.#checker.getBaseTypes(part)) add(base);
      }
    };
    add(this.#checker.getTypeAtLocation(receiver));
    return names;
  }

  // ── Guards ──

  /** Whether the use of `name` at `node` is guarded by its code (§3.6). */
  #guarded(node: OxcNode, name: string, ancestors: readonly OxcNode[]): boolean {
    const parent = ancestors[ancestors.length - 1]!;
    if (parent.type === 'CallExpression' && parent['callee'] === node && parent['optional'] === true) return true;
    let child = node;
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const at = ancestors[i]!;
      if (guards(at, child, name)) return true;
      child = at;
    }
    return false;
  }
}

/** Whether `parent` guards its `child` for `name`: a branch it tests, or an exit before it. */
function guards(parent: OxcNode, child: OxcNode, name: string): boolean {
  switch (parent.type) {
    case 'IfStatement':
    case 'ConditionalExpression': {
      const test = parent['test'] as OxcNode;
      // The condition itself is where the name is tested, whichever way round.
      if (test === child) return tests(test, name) || missing(test, name);
      return parent['consequent'] === child && tests(test, name);
    }
    case 'LogicalExpression': {
      const left = parent['left'] as OxcNode;
      if (left === child) return tests(left, name) || missing(left, name);
      return parent['operator'] === '&&' ? tests(left, name) : parent['operator'] === '||' && missing(left, name);
    }
    case 'Program':
    case 'BlockStatement':
    case 'StaticBlock': {
      const body = parent['body'] as readonly OxcNode[];
      return body.slice(0, body.indexOf(child)).some((statement) => exitsUnless(statement, name));
    }
    default:
      return false;
  }
}

/** Whether `expression` tests that `name` is there, in one of its `&&` operands. */
function tests(expression: OxcNode, name: string): boolean {
  const node = unwrap(expression);
  if (node.type === 'LogicalExpression' && node['operator'] === '&&') {
    return tests(node['left'] as OxcNode, name) || tests(node['right'] as OxcNode, name);
  }
  if (node.type === 'BinaryExpression') {
    const left = unwrap(node['left'] as OxcNode);
    const right = unwrap(node['right'] as OxcNode);
    const operator = node['operator'] as string;
    if (operator === 'in') return left.type === 'Literal' && left['value'] === name;
    if (operator === '!==' || operator === '!=') return compares(left, right, name, (v) => v === 'undefined');
    if (operator === '===' || operator === '==') return typeOf(left, right, name, (v) => v !== 'undefined');
    return false;
  }
  return lastName(node) === name;
}

/** Whether `expression` is false when `name` is missing: `!test`, `typeof X === 'undefined'`, `x.n == null`. */
function missing(expression: OxcNode, name: string): boolean {
  const node = unwrap(expression);
  if (node.type === 'LogicalExpression' && node['operator'] === '||') {
    return missing(node['left'] as OxcNode, name) || missing(node['right'] as OxcNode, name);
  }
  if (node.type === 'UnaryExpression' && node['operator'] === '!') return tests(node['argument'] as OxcNode, name);
  if (node.type === 'BinaryExpression' && (node['operator'] === '===' || node['operator'] === '==')) {
    return compares(unwrap(node['left'] as OxcNode), unwrap(node['right'] as OxcNode), name, (v) => v === 'undefined');
  }
  return false;
}

/** `if (<name is missing>) return` or `throw`: what follows it in the block has the name. */
function exitsUnless(statement: OxcNode, name: string): boolean {
  return statement.type === 'IfStatement' && exits(statement['consequent'] as OxcNode) && missing(statement['test'] as OxcNode, name);
}

function exits(statement: OxcNode): boolean {
  if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') return true;
  const body = statement.type === 'BlockStatement' ? (statement['body'] as readonly OxcNode[]) : [];
  return body.length > 0 && exits(body[body.length - 1]!);
}

/**
 * `a` and `b` compare the name with absence: `typeof name` with a string `typeof` accepts, or the
 * name itself with `undefined` or `null` — either way round.
 */
function compares(a: OxcNode, b: OxcNode, name: string, accepts: (typeOf: string) => boolean): boolean {
  if (typeOf(a, b, name, accepts)) return true;
  const absent = (n: OxcNode): boolean => (n.type === 'Identifier' && n['name'] === 'undefined') || (n.type === 'Literal' && n['value'] === null);
  return (lastName(a) === name && absent(b)) || (lastName(b) === name && absent(a));
}

/** `typeof <name>` on one side and a string `accepts` on the other. */
function typeOf(a: OxcNode, b: OxcNode, name: string, accepts: (value: string) => boolean): boolean {
  const pair = (t: OxcNode, v: OxcNode): boolean =>
    t.type === 'UnaryExpression' &&
    t['operator'] === 'typeof' &&
    lastName(t['argument'] as OxcNode) === name &&
    v.type === 'Literal' &&
    typeof v['value'] === 'string' &&
    accepts(v['value']);
  return pair(a, b) || pair(b, a);
}

/** The name an expression ends in: `x` of `x`, `n` of `a.b.n` and of `a['n']`. */
function lastName(expression: OxcNode): string | undefined {
  const node = unwrap(expression);
  if (node.type === 'Identifier') return node['name'] as string;
  if (node.type !== 'MemberExpression') return undefined;
  const property = node['property'] as OxcNode;
  if (node['computed'] !== true) return property['name'] as string;
  return property.type === 'Literal' && typeof property['value'] === 'string' ? property['value'] : undefined;
}

/** Through parentheses, `!` assertions and the chain an optional access is wrapped in. */
function unwrap(node: OxcNode): OxcNode {
  let at = node;
  while (at.type === 'ParenthesizedExpression' || at.type === 'TSNonNullExpression' || at.type === 'ChainExpression') {
    at = at['expression'] as OxcNode;
  }
  return at;
}

/** A type as a key names it: `PromiseConstructor` is `Promise`. */
function readAs(name: string): string {
  return name.endsWith('Constructor') && name.length > 'Constructor'.length ? name.slice(0, -'Constructor'.length) : name;
}

function isNode(value: unknown): value is OxcNode {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}
