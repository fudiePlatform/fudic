/**
 * What the server evaluates of the `@code` to paint (SDD-61 §3.9, decision 164): the cut of
 * SDD-60 §4.8 — what the view reads, transitively — has to be made of forms every backend can
 * evaluate. A `props<T>()`, a `signal(v)`, a `computed(() => e)`, a `const` of the portable view,
 * a literal of data, a call of fudic's catalogue, and the imports that bring them.
 *
 * The walk starts at the names the view reads while painting — never a handler's, never a
 * callback's — and follows each declaration's initializer to the names IT reads, into the stores
 * of the project too (through `readModule`). Each declaration is judged once:
 *
 * - its FORM: one the server cannot evaluate is `FUD1150`, on the declaration, with `related` to
 *   the first use in the view that pulled it in;
 * - the nodes of its initializer: the same white list as the markup, with the same codes;
 * - `now()`: only as the whole argument of a `signal(…)` of the `@code` (`FUD0912`).
 *
 * A function is a form only as a value. One the view CALLS is already a call the view's rules
 * judge (`FUD1140`), and its body is browser code: it is neither reported nor followed. One voice
 * per fact.
 *
 * Never throws: a module that does not parse is TypeScript's to report, and is skipped.
 */

import { parseSync } from 'oxc-parser';
import { FUD0912, FUD1150 } from '@fudic/diagnostics';
import { patternNames, walkPattern, type OxcNode } from '../oxc/index.js';
import { span, type Diagnostic, type RelatedLocation, type Span } from '../types/index.js';
import type { ProjectModule, SemanticInput } from './model.js';
import { child, children, field, isNode, nameOf } from './view-ast.js';
import { NO_TEMPLATE, codeStatements, moduleScope, type ViewScope } from './view-scope.js';
import {
  PORTABLE_GLOBALS,
  PortableCheck,
  fudSite,
  portableView,
  type PortableFinding,
  type Site,
} from './view-portable.js';

/** The names of fudic's packages the server cut may import (§3.9): its catalogue. */
const CATALOGUE: ReadonlySet<string> = new Set([
  'signal',
  'computed',
  'inject',
  'trustedUrl',
  'trustedHtml',
  't',
  'now',
  'date',
  'number',
  'currency',
  'percent',
  'relativeTime',
  'list',
]);

/** Where fudic's own packages live, and the prefix of a `.fudapi`'s types. */
const FUDIC_PACKAGE = '@fudic/';
const FUDAPI = 'fudic:';

/** The message every `related` of this rule carries: the read that pulled the declaration in. */
const READ_HERE = 'read here by the view';

/** One name a unit declares at its top level, and the node that declares it. */
interface Declaration {
  /** What a diagnostic about its form underlines. */
  readonly node: OxcNode;
  readonly kind: 'import' | 'variable' | 'other';
  /** For an import: its declaration, which holds the specifier and the `import type`. */
  readonly statement: OxcNode;
}

/** A file whose top level the cut walks: the `@code` of the `.fud`, or a module of the project. */
interface Unit {
  readonly declarations: ReadonlyMap<string, Declaration>;
  readonly statements: readonly OxcNode[];
  readonly view: ViewScope;
  readonly site: Site;
  /** Absent for the `.fud`; the module's path otherwise — what its diagnostics are reported on. */
  readonly file?: string;
  /** What `readModule` takes as the importer of this unit's own imports. */
  readonly importer?: string;
}

/** A name read, and the first read of the view that leads to it. */
interface Read {
  readonly name: string;
  /** Whether it is read as the callee of a call: a function then is the view rules' business. */
  readonly callee: boolean;
  readonly use: RelatedLocation;
}

/** The server cut of one input: what it reports, and where it lies in the `.fud`'s own `@code`. */
export interface ServerCutResult {
  readonly diagnostics: readonly Diagnostic[];
  /** The expressions of the `@code` the white list checks: what the typed pass checks too (§4.2). */
  readonly expressions: readonly OxcNode[];
  /** Each `const`/`let` declarator of the `@code` in the cut: whose type has to port (§3.10). */
  readonly declarations: readonly OxcNode[];
}

const cuts = new WeakMap<SemanticInput, ServerCutResult>();

/** The server cut of `input`, walked once per input. */
export function serverCut(input: SemanticInput): ServerCutResult {
  let cut = cuts.get(input);
  if (cut === undefined) {
    cut = new ServerCut(input).run();
    cuts.set(input, cut);
  }
  return cut;
}

/** Every diagnostic of the server cut of `input`. */
export function serverCutDiagnostics(input: SemanticInput): readonly Diagnostic[] {
  return serverCut(input).diagnostics;
}

/** A module parsed once per object the host hands back (§4.1): its cache is the host's. */
const parsedModules = new WeakMap<ProjectModule, readonly OxcNode[] | undefined>();

function parseModule(module: ProjectModule): readonly OxcNode[] | undefined {
  if (parsedModules.has(module)) return parsedModules.get(module);
  const parsed = parseSync(module.path, module.source, { lang: 'ts', sourceType: 'module' });
  const statements = parsed.errors.length > 0 ? undefined : (parsed.program.body as unknown as readonly OxcNode[]);
  parsedModules.set(module, statements);
  return statements;
}

class ServerCut {
  readonly #input: SemanticInput;
  readonly #out: Diagnostic[] = [];
  readonly #cut: OxcNode[] = [];
  readonly #declared: OxcNode[] = [];
  /** The declarations already judged: each once, whatever reads it. */
  readonly #judged = new Set<OxcNode>();
  /** The exports already followed, as `path#name`: a cycle of re-exports ends. */
  readonly #exports = new Set<string>();

  constructor(input: SemanticInput) {
    this.#input = input;
  }

  run(): ServerCutResult {
    const input = this.#input;
    const view = portableView(input);
    const statements = codeStatements(input);
    const unit: Unit = {
      declarations: declarationsOf(statements),
      statements,
      view: view.scope,
      site: fudSite(input),
      ...(input.path === undefined ? {} : { importer: input.path }),
    };
    const callees = calleesOf(view.scope.fragments.map((fragment) => fragment.root));
    const reads = view.reads.map((node) => this.#readOf(unit, node, callees));
    // The first use of a name is the one its diagnostic points back to.
    reads.sort((a, b) => a.use.span.start - b.use.span.start);
    for (const read of reads) this.#read(unit, read);
    return { diagnostics: this.#out, expressions: this.#cut, declarations: this.#declared };
  }

  #readOf(unit: Unit, node: OxcNode, callees: ReadonlySet<OxcNode>, use?: RelatedLocation): Read {
    return {
      name: nameOf(node),
      callee: callees.has(node),
      use: use ?? { span: this.#span(unit, node), message: READ_HERE },
    };
  }

  // ── Reporting ──

  /** A diagnostic of `unit`: in a module, on its file and with the view's use beside it. */
  #report(unit: Unit, diagnostic: Diagnostic, use: RelatedLocation): void {
    this.#out.push(unit.file === undefined ? diagnostic : { ...diagnostic, file: unit.file, related: [use] });
  }

  #span(unit: Unit, node: OxcNode): Span {
    return unit.site.range(node.start, node.end);
  }

  /** `FUD1150` on a declaration: in the `.fud` it points back to the use, in a module too. */
  #unportable(unit: Unit, node: OxcNode, use: RelatedLocation): void {
    this.#out.push(FUD1150({ span: this.#span(unit, node), related: [use], ...(unit.file === undefined ? {} : { file: unit.file }) }));
  }

  /**
   * The white list over `nodes`, reported on `unit`; then the names it read, followed. Only
   * those: what the list refused has said its one thing, and is not followed into.
   */
  #check(unit: Unit, use: RelatedLocation, nodes: readonly OxcNode[], each: (check: PortableCheck, node: OxcNode) => void): void {
    const findings: PortableFinding[] = [];
    const reads: OxcNode[] = [];
    const check = new PortableCheck(unit.site, unit.view, NO_TEMPLATE, findings, reads);
    for (const node of nodes) each(check, node);
    if (unit.file === undefined) this.#cut.push(...nodes);
    for (const finding of findings) this.#report(unit, finding.diagnostic, use);
    const callees = calleesOf(nodes);
    for (const node of reads) this.#read(unit, this.#readOf(unit, node, callees, use));
  }

  /** `#check` with every node an expression of the list. */
  #expressions(unit: Unit, use: RelatedLocation, nodes: readonly OxcNode[]): void {
    this.#check(unit, use, nodes, (check, node) => check.expression(node));
  }

  // ── The walk ──

  #read(unit: Unit, read: Read): void {
    const declaration = unit.declarations.get(read.name);
    if (declaration === undefined) return;
    const callable = isCallable(declaration);
    // A function the view CALLS (or a class it `new`s): the call is the view's to judge, the
    // body the browser's.
    if (callable && read.callee) return;
    if (this.#judged.has(declaration.node)) return;
    this.#judged.add(declaration.node);
    if (callable || declaration.kind === 'other') {
      this.#unportable(unit, declaration.node, read.use);
      return;
    }
    if (declaration.kind === 'import') this.#import(unit, declaration, read);
    else this.#declarator(unit, declaration.node, read.use);
  }

  /** An import the cut reads (§3.9): a `.fudapi`, fudic's catalogue, or a module of the project. */
  #import(unit: Unit, declaration: Declaration, read: Read): void {
    const specifier = declaration.node;
    if (field(declaration.statement, 'importKind') === 'type' || field(specifier, 'importKind') === 'type') return;
    const from = String(child(declaration.statement, 'source')!['value']);
    if (from.startsWith(FUDAPI)) return;
    const imported = importedName(specifier);
    if (from.startsWith(FUDIC_PACKAGE)) {
      if (imported === undefined || !CATALOGUE.has(imported)) this.#unportable(unit, specifier, read.use);
      return;
    }
    // A path, relative or absolute (from the root of the disk, or from a drive on Windows), is
    // a module of the project; anything else names a package.
    if (!from.startsWith('.') && !from.startsWith('/') && !/^[A-Za-z]:\//u.test(from)) {
      this.#unportable(unit, specifier, read.use);
      return;
    }
    // A namespace import reads no one export: what the view takes of it is not known here.
    if (imported !== undefined) this.#module(unit, from, imported, read.use);
  }

  /** The export `name` of the module `unit` imports as `from`, judged in that module. */
  #module(unit: Unit, from: string, name: string, use: RelatedLocation): void {
    const importer = unit.importer;
    if (importer === undefined) return;
    const module = this.#input.readModule?.(from, importer);
    if (module === undefined) return;
    const key = `${module.path}#${name}`;
    if (this.#exports.has(key)) return;
    this.#exports.add(key);
    const statements = parseModule(module);
    if (statements === undefined) return;
    const store: Unit = {
      declarations: declarationsOf(statements),
      statements,
      view: moduleScope(statements, PORTABLE_GLOBALS),
      site: { source: module.source, range: span },
      file: module.path,
      importer: module.path,
    };
    // The use lives in the `.fud` — the importer of the first module — and from the module's
    // diagnostics that is another file.
    this.#export(store, name, use.file === undefined ? { ...use, file: importer } : use);
  }

  /** Find what `name` exports in `unit` — locally, re-exported, or `export default` — and judge it. */
  #export(unit: Unit, name: string, use: RelatedLocation): void {
    for (const statement of unit.statements) {
      if (statement.type === 'ExportDefaultDeclaration') {
        if (name === 'default') this.#default(unit, child(statement, 'declaration')!, statement, use);
        continue;
      }
      if (statement.type === 'ExportNamedDeclaration') {
        const declaration = child(statement, 'declaration');
        if (declaration !== undefined) {
          if (declaredNames(declaration).includes(name)) this.#read(unit, { name, callee: false, use });
          continue;
        }
        const source = child(statement, 'source');
        for (const specifier of children(statement, 'specifiers')) {
          if (moduleName(child(specifier, 'exported')!) !== name) continue;
          const local = moduleName(child(specifier, 'local')!);
          if (source === undefined) this.#read(unit, { name: local, callee: false, use });
          else this.#module(unit, String(source['value']), local, use);
        }
        continue;
      }
      if (statement.type === 'ExportAllDeclaration' && child(statement, 'exported') === undefined && name !== 'default') {
        this.#module(unit, String(child(statement, 'source')!['value']), name, use);
      }
    }
  }

  /** `export default` of a data module: a literal of data, or a name the module declares. */
  #default(unit: Unit, value: OxcNode, statement: OxcNode, use: RelatedLocation): void {
    if (isDataLiteral(value)) return;
    if (value.type === 'Identifier') {
      this.#read(unit, { name: nameOf(value), callee: false, use });
      return;
    }
    this.#unportable(unit, statement, use);
  }

  /** One `const x = …` / `let x = …` of the cut, by the forms of §3.9. */
  #declarator(unit: Unit, declarator: OxcNode, use: RelatedLocation): void {
    const init = child(declarator, 'init');
    if (init === undefined) {
      this.#unportable(unit, declarator, use);
      return;
    }
    const value = inner(init);
    const catalogue = value.type === 'CallExpression' ? catalogueCall(unit.view, value) : undefined;
    const args = value.type === 'CallExpression' ? children(value, 'arguments') : [];
    // A value the server holds while painting, whose type has to port (§3.10). The props are
    // typed by their contract, a service is no value, and `now()` here is already an error.
    if (unit.file === undefined && !UNTYPED.has(catalogue ?? '')) this.#declared.push(declarator);
    switch (catalogue) {
      case 'props': {
        const defaults: OxcNode[] = [];
        walkPattern(child(declarator, 'id'), { name() {}, expression: (node) => defaults.push(node as OxcNode) });
        // A default may be a literal of data, typed by the contract: `rows = []`, `m = {}`.
        this.#expressions(unit, use, defaults.filter((node) => !isDataLiteral(node)));
        return;
      }
      case 'signal':
        this.#signal(unit, args, use);
        return;
      case 'computed':
        this.#computed(unit, declarator, args, use);
        return;
      case 'inject':
        // A token names a service, it is no value the view paints with (§3.9).
        return;
      case 'now':
        this.#report(unit, FUD0912({ span: this.#span(unit, value) }), use);
        return;
      case undefined:
        this.#value(unit, declarator, init, use);
        return;
      default:
        this.#arguments(unit, args, use);
    }
  }

  /** `signal(v)`: `v` a value of the list, a literal of data, or `now()` outside a store. */
  #signal(unit: Unit, args: readonly OxcNode[], use: RelatedLocation): void {
    const values: OxcNode[] = [];
    for (const arg of args) {
      if (arg.type === 'CallExpression' && catalogueCall(unit.view, arg) === 'now' && children(arg, 'arguments').length === 0) {
        // A store is evaluated once per process on the server: its clock would stop (§3.12).
        if (unit.file !== undefined) this.#report(unit, FUD0912({ span: this.#span(unit, arg) }), use);
        continue;
      }
      if (!isDataLiteral(arg)) values.push(arg);
    }
    this.#expressions(unit, use, values);
  }

  /** `computed(() => e)`: an arrow with no parameters and an expression body, `e` of the list. */
  #computed(unit: Unit, declarator: OxcNode, args: readonly OxcNode[], use: RelatedLocation): void {
    const arrow = args.length === 1 ? args[0]! : undefined;
    const body =
      arrow?.type === 'ArrowFunctionExpression' &&
      field(arrow, 'expression') === true &&
      field(arrow, 'async') !== true &&
      children(arrow, 'params').length === 0
        ? child(arrow, 'body')!
        : undefined;
    if (body === undefined) {
      this.#unportable(unit, declarator, use);
      return;
    }
    this.#expressions(unit, use, [body]);
  }

  /** The arguments of a call of the catalogue: literals of data, holes of `t()`, or values. */
  #arguments(unit: Unit, args: readonly OxcNode[], use: RelatedLocation): void {
    const values = args.filter((arg) => !isDataLiteral(arg));
    this.#check(unit, use, values, (check, arg) => {
      if (arg.type === 'ObjectExpression') check.holes([arg]);
      else check.expression(arg);
    });
  }

  /**
   * `const x = e`: a literal of data, or a value of the list. One whose initializer IS a call
   * the list has no lowering for — `toLocaleTimeString(…)`, `find(…)` — or a `new`, is a
   * declaration the server cannot evaluate, and says so once, on the declaration.
   */
  #value(unit: Unit, declarator: OxcNode, init: OxcNode, use: RelatedLocation): void {
    const value = inner(init);
    if (isDataLiteral(value)) return;
    if (value.type === 'NewExpression' || (value.type === 'CallExpression' && !isReadCall(value))) {
      this.#unportable(unit, declarator, use);
      return;
    }
    this.#expressions(unit, use, [init]);
  }
}

// ── The shapes ──

/** The value inside parentheses and a `satisfies`: what gives a literal of data its type. */
function inner(node: OxcNode): OxcNode {
  let current = node;
  while (current.type === 'ParenthesizedExpression' || current.type === 'TSSatisfiesExpression') {
    current = child(current, 'expression')!;
  }
  return current;
}

/** A literal of data (§3.9): an object or array literal whose leaves are literals of §3.2. */
function isDataLiteral(node: OxcNode): boolean {
  const value = inner(node);
  switch (value.type) {
    case 'Literal':
      return field(value, 'regex') == null && field(value, 'bigint') == null;
    case 'UnaryExpression':
      return field(value, 'operator') === '-' && child(value, 'argument')!.type === 'Literal' && typeof field(child(value, 'argument')!, 'value') === 'number';
    case 'ArrayExpression':
      return (value['elements'] as readonly unknown[]).every((element) => isNode(element) && element.type !== 'SpreadElement' && isDataLiteral(element));
    case 'ObjectExpression':
      return children(value, 'properties').every(
        (property) =>
          property.type === 'Property' &&
          field(property, 'kind') === 'init' &&
          field(property, 'computed') !== true &&
          field(property, 'method') !== true &&
          field(property, 'shorthand') !== true &&
          isDataLiteral(child(property, 'value')!),
      );
    default:
      return false;
  }
}

/**
 * A call the white list knows: a reactive read with no arguments, or a collection operation. An
 * optional call is a `ChainExpression`, which the list judges itself.
 */
function isReadCall(call: OxcNode): boolean {
  const callee = child(call, 'callee')!;
  if (children(call, 'arguments').length === 0) return isPath(callee);
  return callee.type === 'MemberExpression' && field(callee, 'computed') !== true && COLLECTION.has(nameOf(child(callee, 'property')!));
}

const COLLECTION: ReadonlySet<string> = new Set(['filter', 'map', 'reduce', 'toSorted']);

/** The catalogue calls whose declaration the typed pass does not type (§3.10). */
const UNTYPED: ReadonlySet<string> = new Set(['props', 'inject', 'now']);

function isPath(node: OxcNode): boolean {
  if (node.type === 'Identifier') return true;
  return node.type === 'MemberExpression' && field(node, 'computed') !== true && isPath(child(node, 'object')!);
}

/**
 * The catalogue name a call is to: an import of fudic's packages by that name, or `props`, which
 * the `@code` reads without importing it.
 */
function catalogueCall(view: ViewScope, call: OxcNode): string | undefined {
  const callee = child(call, 'callee')!;
  if (callee.type !== 'Identifier') return undefined;
  const name = nameOf(callee);
  if (name === 'props' && view.resolve(name, NO_TEMPLATE) === undefined) return 'props';
  const imported = view.imported(name);
  if (imported === undefined || !imported.startsWith(FUDIC_PACKAGE)) return undefined;
  const member = imported.slice(imported.indexOf('#') + 1);
  return CATALOGUE.has(member) ? member : undefined;
}

/** Every identifier that is the callee of a call, in `root`: `hora` of `hora()`. */
function calleesOf(root: unknown, out: Set<OxcNode> = new Set()): Set<OxcNode> {
  if (Array.isArray(root)) {
    for (const item of root) calleesOf(item, out);
    return out;
  }
  if (!isNode(root)) return out;
  if (root.type === 'CallExpression') {
    const callee = child(root, 'callee')!;
    if (callee.type === 'Identifier') out.add(callee);
  }
  for (const key of Object.keys(root)) calleesOf(root[key], out);
  return out;
}

// ── The top level of a unit ──

/** What every top-level statement of a unit declares, by name. */
function declarationsOf(statements: readonly OxcNode[]): ReadonlyMap<string, Declaration> {
  const out = new Map<string, Declaration>();
  for (const statement of statements) {
    if (statement.type === 'ImportDeclaration') {
      for (const specifier of children(statement, 'specifiers')) {
        out.set(nameOf(child(specifier, 'local')!), { node: specifier, kind: 'import', statement });
      }
      continue;
    }
    const declaration = statement.type === 'ExportNamedDeclaration' ? child(statement, 'declaration') : statement;
    if (declaration === undefined) continue;
    if (declaration.type === 'VariableDeclaration') {
      for (const declarator of children(declaration, 'declarations')) {
        for (const name of patternNames(declarator['id'])) out.set(name, { node: declarator, kind: 'variable', statement: declaration });
      }
      continue;
    }
    for (const name of declaredNames(declaration)) out.set(name, { node: declaration, kind: 'other', statement: declaration });
  }
  return out;
}

/** The names a declaration binds: a variable's patterns, or a function, class or enum's id. */
function declaredNames(declaration: OxcNode): readonly string[] {
  if (declaration.type === 'VariableDeclaration') {
    return children(declaration, 'declarations').flatMap((declarator) => patternNames(declarator['id']));
  }
  // Types are erased, and nothing the view reads is one.
  if (!VALUE_DECLARATIONS.has(declaration.type)) return [];
  // Only an `export default` declares a function or a class with no name, and it is no
  // top-level binding: `#export` reads it as the default.
  return [nameOf(child(declaration, 'id')!)];
}

const VALUE_DECLARATIONS: ReadonlySet<string> = new Set(['FunctionDeclaration', 'ClassDeclaration', 'TSEnumDeclaration']);

/** The code the cut never evaluates as a value: a function or a class, declared or bound. */
const CALLABLE_DECLARATIONS: ReadonlySet<string> = new Set(['FunctionDeclaration', 'ClassDeclaration']);
const CALLABLE_VALUES: ReadonlySet<string> = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'ClassExpression']);

/** `function f`, `class C`, `const f = () => …`, `const C = class {}`. */
function isCallable(declaration: Declaration): boolean {
  if (declaration.kind === 'other') return CALLABLE_DECLARATIONS.has(declaration.node.type);
  const init = declaration.kind === 'variable' ? child(declaration.node, 'init') : undefined;
  return init !== undefined && CALLABLE_VALUES.has(inner(init).type);
}

/** The exported name an import specifier takes: `default`, a name, or none for `* as ns`. */
function importedName(specifier: OxcNode): string | undefined {
  if (specifier.type === 'ImportDefaultSpecifier') return 'default';
  if (specifier.type === 'ImportNamespaceSpecifier') return undefined;
  return moduleName(child(specifier, 'imported')!);
}

/** A module export name: an identifier, or a string literal (`export { a as "b-c" }`). */
function moduleName(node: OxcNode): string {
  return node.type === 'Identifier' ? nameOf(node) : String(node['value']);
}
