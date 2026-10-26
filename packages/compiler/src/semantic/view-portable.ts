/**
 * What the JS of the view may DO once it has to port to every backend (SDD-61 §3): one walk
 * over the Oxc AST of every fragment, by WHITE list.
 *
 * The test is the lowering, not whether a construct exists in every language: the view holds
 * what the compiler can lower to TS, C#, Java, Go, Rust and Python with the same result. So a
 * call is a read of a reactive value or one of the four collection operations, an operator is
 * one of a closed set, and there are no literals of objects or arrays, no `new`, no globals but
 * `undefined` and no TypeScript syntax.
 *
 * Without types. What depends on them — that a call with no arguments reads something reactive,
 * that a condition is a `boolean`, that a type ports — is the typed pass's (§4.2).
 *
 * The five view analyzers share this walk and split its findings by `rule`, as SDD-51's do:
 * one traversal, one answer to where a scope opens. A forbidden node is reported once and not
 * descended into, while its siblings still are (SDD-51 §4.3). Never throws: an AST of an
 * unexpected shape is a node not on the list.
 *
 * It replaces `view-js.ts` when the portable view is switched on for everyone (SDD-61 task 36);
 * until then it runs behind `SemanticInput.portableView`.
 */

import {
  FUD0461,
  FUD0900,
  FUD0901,
  FUD0902,
  FUD0903,
  FUD0904,
  FUD0905,
  FUD0906,
  FUD0907,
  FUD0908,
  FUD0910,
  FUD0912,
  FUD0913,
  FUD0917,
  FUD0918,
  FUD0919,
  FUD1140,
  FUD1141,
  FUD1142,
  FUD1143,
  FUD1144,
  FUD1145,
  FUD1146,
  FUD1147,
  FUD1148,
} from '@fudic/diagnostics';
import { freeReferenceNodes } from '../emit/scope.js';
import { patternNames, type OxcNode } from '../oxc/index.js';
import { span, type Diagnostic, type Span } from '../types/index.js';
import type { SemanticInput } from './model.js';
import { alwaysTrue, child, children, field, nameOf, readNames } from './view-ast.js';
import {
  NO_TEMPLATE,
  readsName,
  viewScope,
  type TemplateScope,
  type ViewFragment,
  type ViewScope,
} from './view-scope.js';

/** Which analyzer reports a finding (§4.1). */
export type PortableRule = 'expression' | 'statement' | 'identifier' | 'rest' | 'control';

export interface PortableFinding {
  readonly rule: PortableRule;
  readonly diagnostic: Diagnostic;
}

/** The one global the portable view reads (§3.2). */
const GLOBALS: ReadonlySet<string> = new Set(['undefined']);

const memo = new WeakMap<SemanticInput, readonly PortableFinding[]>();

/** Every finding of the portable view of `input`, computed once per input. */
export function portableFindings(input: SemanticInput): readonly PortableFinding[] {
  let findings = memo.get(input);
  if (findings === undefined) {
    const view = viewScope(input, GLOBALS);
    const out: PortableFinding[] = [];
    for (const fragment of view.fragments) new PortableCheck(input, view, fragment, out).run();
    findings = out;
    memo.set(input, findings);
  }
  return findings;
}

// ── The closed lists of §3 ──

/** The collection operations (§3.5 bis): how many arguments, and at most how many parameters. */
const COLLECTION: ReadonlyMap<string, { readonly args: number; readonly params: number }> = new Map([
  ['filter', { args: 1, params: 2 }],
  ['map', { args: 1, params: 2 }],
  ['reduce', { args: 2, params: 3 }],
  ['toSorted', { args: 1, params: 2 }],
]);

/** The binary operators that port (§3.4). `|` is the pipe of SDD-58, not a bitwise or. */
const BINARY: ReadonlySet<string> = new Set(['+', '-', '*', '/', '%', '===', '!==', '<', '<=', '>', '>=', '|']);
/** The unary operators that port (§3.4). `delete` is a write, and SDD-51's. */
const UNARY: ReadonlySet<string> = new Set(['-', '!']);
/** The assignments an `@{ }` may write (§3.7). */
const ASSIGNMENT: ReadonlySet<string> = new Set(['=', '+=', '-=', '*=', '/=', '%=']);
/** The assignments a `@for` step may write: `i += e`, `i -= e`, `i = e` (§3.7). */
const STEP: ReadonlySet<string> = new Set(['=', '+=', '-=']);
/** Members that reach the machinery of a value: `Function`, the prototypes (`FUD0910`). */
const REFLECTIVE: ReadonlySet<string> = new Set(['constructor', '__proto__', 'prototype']);

/** The TypeScript wrappers of a value: each one is `FUD1144` (§3.13). */
const TYPESCRIPT: ReadonlySet<string> = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression',
]);

/** The catalogue names the walk knows by their import (§3.3, §3.12). */
const NOW = '@fudic/core#now';
const TRANSLATE = '@fudic/i18n#t';

/** A UTF-16 surrogate with no partner: no valid text outside JS (`FUD1143`). */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;

/** A `case` value the backends can match: a literal, or a negative number (§3.7). */
function isCaseLiteral(node: OxcNode): boolean {
  if (node.type === 'Literal') return field(node, 'regex') == null;
  if (node.type !== 'UnaryExpression' || field(node, 'operator') !== '-') return false;
  const argument = child(node, 'argument')!;
  return argument.type === 'Literal' && typeof field(argument, 'value') === 'number';
}

/** A name, or a path of names: what a reactive read is called on (§3.3). */
function isPath(node: OxcNode): boolean {
  if (node.type === 'Identifier') return true;
  return node.type === 'MemberExpression' && field(node, 'computed') !== true && isPath(child(node, 'object')!);
}

/** The value of a parenthesized expression: parentheses change nothing the lists look at. */
function inner(node: OxcNode): OxcNode {
  let current = node;
  while (current.type === 'ParenthesizedExpression') current = child(current, 'expression')!;
  return current;
}

/** What a name the fragment declares itself is: a plain binding, or a `...rest` (§3.6). */
type Local = 'plain' | 'rest';

/** The checks over one fragment. Lives as long as the fragment's walk. */
class PortableCheck {
  readonly #input: SemanticInput;
  readonly #view: ViewScope;
  readonly #fragment: ViewFragment;
  readonly #template: TemplateScope;
  readonly #out: PortableFinding[];
  /** What the fragment declares itself: arrow parameters, `@{ }` bindings, loop heads. */
  readonly #frames: Map<string, Local>[] = [];
  /** The neutral `let`s this `@{ }` has already reassigned plainly, in its own order. */
  readonly #seeded = new Set<string>();
  /** Whether the fragment is the value of a `.prop`: the one place `t()` goes (§3.3). */
  #prop = false;

  constructor(input: SemanticInput, view: ViewScope, fragment: ViewFragment, out: PortableFinding[]) {
    this.#input = input;
    this.#view = view;
    this.#fragment = fragment;
    this.#template = fragment.scope;
    this.#out = out;
  }

  run(): void {
    const { root, shape, owner } = this.#fragment;
    this.#frames.push(new Map());
    switch (shape) {
      case 'statements':
        for (const statement of root as readonly OxcNode[]) this.#statement(statement);
        break;
      case 'handler':
        this.#handler(root as OxcNode);
        break;
      case 'while':
        this.#while(root as OxcNode);
        break;
      case 'prop':
        this.#propValue(root as OxcNode);
        break;
      case 'key':
        this.#expression(root as OxcNode);
        break;
      case 'expression':
        if (owner.type === 'switch-case') this.#case(root as OxcNode);
        else this.#expression(root as OxcNode);
        break;
      default:
        this.#header(root as OxcNode);
    }
    this.#frames.pop();
  }

  // ── Reporting ──

  #range(start: number, end: number): Span {
    return this.#input.js.mapSpan(start, end);
  }

  #span(node: OxcNode): { readonly span: Span } {
    return { span: this.#range(node.start, node.end) };
  }

  #report(rule: PortableRule, diagnostic: Diagnostic): void {
    this.#out.push({ rule, diagnostic });
  }

  #text(node: OxcNode): string {
    const at = this.#range(node.start, node.end);
    return this.#input.source.slice(at.start, at.end);
  }

  /** `at` without the whitespace at either end, in the `.fud`. */
  #trim(at: Span): Span {
    const text = this.#input.source.slice(at.start, at.end);
    const start = at.start + (text.length - text.trimStart().length);
    return span(start, Math.max(start, at.end - (text.length - text.trimEnd().length)));
  }

  /** Where `operator` is written between two operands: what a `FUD1142` underlines (§4.2). */
  #between(left: OxcNode, right: OxcNode, operator: string): { readonly span: Span } {
    const gap = this.#range(left.end, right.start);
    const at = gap.start + this.#input.source.slice(gap.start, gap.end).indexOf(operator);
    return { span: span(at, at + operator.length) };
  }

  // ── Names ──

  /** What the fragment's own innermost declaration of `name` is, if it declares one. */
  #local(name: string): Local | undefined {
    for (let i = this.#frames.length - 1; i >= 0; i--) {
      const local = this.#frames[i]!.get(name);
      if (local !== undefined) return local;
    }
    return undefined;
  }

  #scoped(body: () => void): void {
    this.#frames.push(new Map());
    body();
    this.#frames.pop();
  }

  /**
   * Declare a name. One the TEMPLATE declares lands in the render function next to `@code`'s,
   * so it may neither take the `$` of the emit (`FUD0461`) nor redeclare what `@code` or the
   * role already name (`FUD0918`). An arrow parameter is scoped to its arrow and only declares.
   */
  #declare(node: OxcNode, template: boolean, local: Local): void {
    const name = nameOf(node);
    if (template) {
      if (name.startsWith('$')) this.#report('statement', FUD0461({ ...this.#span(node), name }));
      else if (this.#view.resolve(name, NO_TEMPLATE) !== undefined) this.#report('statement', FUD0918(this.#span(node)));
    }
    this.#frames[this.#frames.length - 1]!.set(name, local);
  }

  /** Whether `name`, read here, is a `...rest` binding (§3.6). */
  #isRest(name: string): boolean {
    const local = this.#local(name);
    return local === undefined ? this.#view.isRest(name, this.#template) : local === 'rest';
  }

  /**
   * A name READ by the view. `asRest` says the read is one of the uses a `...rest` allows:
   * `rest.field`, or the source of another pattern (§3.6). Anywhere else a rest is `FUD1147`.
   */
  #read(node: OxcNode, asRest = false): void {
    const name = nameOf(node);
    if (!asRest && this.#isRest(name)) {
      this.#report('rest', FUD1147({ ...this.#span(node), name }));
      return;
    }
    if (this.#local(name) !== undefined) return;
    if (name === 'arguments') {
      this.#report('expression', FUD0904(this.#span(node)));
      return;
    }
    if (this.#view.resolve(name, this.#template) === undefined) this.#report('identifier', FUD0907(this.#span(node)));
  }

  /** The `@code` import a name of the view stands for, unless the fragment shadows it. */
  #catalogue(node: OxcNode): string | undefined {
    if (node.type !== 'Identifier' || this.#local(nameOf(node)) !== undefined) return undefined;
    return this.#view.imported(nameOf(node));
  }

  // ── Expressions (§3.2–§3.5 bis) ──

  #expression(node: OxcNode): void {
    switch (node.type) {
      case 'Identifier':
        this.#read(node);
        return;
      case 'Literal':
        this.#literal(node);
        return;
      case 'TemplateLiteral':
        for (const part of children(node, 'expressions')) this.#expression(part);
        return;
      case 'TaggedTemplateExpression':
        this.#report('expression', FUD0905(this.#span(child(node, 'tag')!)));
        return;
      case 'MemberExpression':
        this.#member(node);
        return;
      case 'ChainExpression':
      case 'ParenthesizedExpression':
        this.#expression(child(node, 'expression')!);
        return;
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'TSTypeAssertion':
      case 'TSInstantiationExpression':
        this.#report('expression', FUD1144({ span: this.#typescript(node) }));
        return;
      case 'CallExpression':
        this.#call(node);
        return;
      case 'NewExpression':
        this.#report('expression', FUD1141({ span: this.#range(node.start, child(node, 'callee')!.end) }));
        return;
      case 'UnaryExpression':
        this.#unary(node);
        return;
      case 'BinaryExpression': {
        const operator = String(field(node, 'operator'));
        const left = child(node, 'left')!;
        const right = child(node, 'right')!;
        if (!BINARY.has(operator)) {
          this.#report('expression', FUD1142({ ...this.#between(left, right, operator), operator }));
          return;
        }
        this.#expression(left);
        this.#expression(right);
        return;
      }
      case 'LogicalExpression':
        this.#expression(child(node, 'left')!);
        this.#expression(child(node, 'right')!);
        return;
      case 'ConditionalExpression':
        this.#expression(child(node, 'test')!);
        this.#expression(child(node, 'consequent')!);
        this.#expression(child(node, 'alternate')!);
        return;
      case 'ArrayExpression':
      case 'ObjectExpression':
        this.#report('expression', FUD1143(this.#span(node)));
        return;
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
      case 'ClassExpression':
        this.#report('expression', FUD0905(this.#span(node)));
        return;
      case 'AssignmentExpression':
      case 'UpdateExpression':
        this.#report('expression', FUD0900(this.#span(node)));
        return;
      case 'AwaitExpression':
      case 'YieldExpression':
        this.#report('expression', FUD0902(this.#span(node)));
        return;
      case 'ImportExpression':
      case 'MetaProperty':
        this.#report('expression', FUD0903(this.#span(node)));
        return;
      case 'ThisExpression':
      case 'Super':
        this.#report('expression', FUD0904(this.#span(node)));
        return;
      case 'SequenceExpression':
        this.#report('expression', FUD0906(this.#span(node)));
        return;
      // Not on the list: refused. Every expression Oxc parses today is one of the cases above
      // (a `SpreadElement` or a `PrivateIdentifier` only appears under a node that owns it);
      // this is for tomorrow's.
      /* v8 ignore next 2 */
      default:
        this.#report('expression', FUD0905(this.#span(node)));
    }
  }

  /** A regex is `FUD0919`; a `bigint` or a lone surrogate, `FUD1143` (§3.2). */
  #literal(node: OxcNode): void {
    if (field(node, 'regex') != null) {
      this.#report('expression', FUD0919(this.#span(node)));
      return;
    }
    const value = field(node, 'value');
    if (field(node, 'bigint') != null || (typeof value === 'string' && LONE_SURROGATE.test(value))) {
      this.#report('expression', FUD1143(this.#span(node)));
    }
  }

  /** What a `FUD1144` underlines: the `as …`, the `!`, the `<T>` — never the value it wraps. */
  #typescript(node: OxcNode): Span {
    const value = child(node, 'expression')!;
    switch (node.type) {
      case 'TSNonNullExpression':
        return this.#range(node.end - 1, node.end);
      case 'TSTypeAssertion':
        return this.#trim(this.#range(node.start, value.start));
      default:
        return this.#trim(this.#range(value.end, node.end));
    }
  }

  #unary(node: OxcNode): void {
    const operator = String(field(node, 'operator'));
    if (operator === 'delete') {
      this.#report('expression', FUD0900(this.#span(node)));
      return;
    }
    if (!UNARY.has(operator)) {
      this.#report('expression', FUD1142({ span: this.#range(node.start, node.start + operator.length), operator }));
      return;
    }
    this.#expression(child(node, 'argument')!);
  }

  /** `a.b`: the machinery (`FUD0910`) and a stack trace (`FUD0917`) are no fields of data. */
  #member(node: OxcNode): void {
    const property = child(node, 'property')!;
    const computed = field(node, 'computed') === true;
    const name = computed ? undefined : nameOf(property);
    if (name !== undefined && REFLECTIVE.has(name)) {
      this.#report('expression', FUD0910(this.#span(property)));
      return;
    }
    if (name === 'stack') {
      this.#report('expression', FUD0917(this.#span(property)));
      return;
    }
    const object = child(node, 'object')!;
    // `rest.field` is the use a rest is for: it lowers to the source's own field (§3.6).
    if (!computed && object.type === 'Identifier') this.#read(object, true);
    else this.#expression(object);
    if (computed) this.#expression(property);
  }

  /** A call: a reactive read, a collection operation, `t()` on a prop — or `FUD1140` (§3.3). */
  #call(node: OxcNode): void {
    const callee = child(node, 'callee')!;
    const args = children(node, 'arguments');
    const types = child(node, 'typeArguments');
    if (types !== undefined) {
      this.#report('expression', FUD1144(this.#span(types)));
      return;
    }
    const optional = field(node, 'optional') === true;
    const method = callee.type === 'MemberExpression' && field(callee, 'computed') !== true
      ? nameOf(child(callee, 'property')!)
      : undefined;
    const collection = method === undefined ? undefined : COLLECTION.get(method);
    if (!optional && collection !== undefined) {
      this.#collection(node, callee, collection);
      return;
    }
    const catalogue = this.#catalogue(callee);
    if (catalogue === NOW) {
      this.#report('expression', FUD0912(this.#span(node)));
      return;
    }
    if (!optional && catalogue === TRANSLATE && this.#prop) {
      this.#translate(args);
      return;
    }
    // A read of a reactive value — or a method of a name nobody provides, `Math.max(a, b)`,
    // whose fault is the name and is said once, as `FUD0907` (criterion 3).
    if (!optional && isPath(callee) && (args.length === 0 || this.#unknownRoot(callee))) {
      this.#expression(callee);
      return;
    }
    this.#report('expression', FUD1140({ ...this.#span(callee), callee: this.#text(callee) }));
  }

  /** Whether a member path hangs from a name nothing provides: a global the view does not have. */
  #unknownRoot(callee: OxcNode): boolean {
    let root = callee;
    while (root.type === 'MemberExpression') root = child(root, 'object')!;
    const name = nameOf(root);
    return root !== callee && this.#local(name) === undefined && this.#view.resolve(name, this.#template) === undefined;
  }

  /**
   * `xs.filter(x => c)`, `map`, `reduce((acc, x) => e, v)`, `toSorted((a, b) => e)` (§3.5 bis):
   * one arrow with an expression body and plain parameters, and `reduce`'s initial value. The
   * arrow's body follows the same list, with its parameters in scope.
   */
  #collection(node: OxcNode, callee: OxcNode, shape: { readonly args: number; readonly params: number }): void {
    const args = children(node, 'arguments');
    const fault = (at: OxcNode): void => this.#report('expression', FUD1145(this.#span(at)));
    const spread = args.find((arg) => arg.type === 'SpreadElement');
    if (spread !== undefined) return fault(spread);
    if (args.length > shape.args) return fault(args[shape.args]!);
    if (args.length < shape.args) return fault(node);
    const arrow = args[0]!;
    if (arrow.type !== 'ArrowFunctionExpression' || field(arrow, 'async') === true || field(arrow, 'expression') !== true) {
      return fault(arrow);
    }
    const params = children(arrow, 'params');
    const odd = params.find((param, i) => param.type !== 'Identifier' || i >= shape.params);
    if (odd !== undefined) return fault(odd);
    this.#expression(child(callee, 'object')!);
    this.#scoped(() => {
      for (const param of params) {
        const annotation = child(param, 'typeAnnotation');
        if (annotation !== undefined) this.#report('expression', FUD1144(this.#span(annotation)));
        this.#declare(param, false, 'plain');
      }
      this.#expression(child(arrow, 'body')!);
    });
    if (shape.args === 2) this.#expression(args[1]!);
  }

  /** `t("…", { holes })` as the value of a prop (decision 161): its one object literal (§3.13). */
  #translate(args: readonly OxcNode[]): void {
    for (const arg of args) {
      if (arg.type !== 'ObjectExpression') {
        this.#expression(arg);
        continue;
      }
      for (const property of children(arg, 'properties')) {
        const plain = property.type === 'Property' && field(property, 'kind') === 'init' && field(property, 'computed') !== true;
        if (!plain || field(property, 'method') === true) this.#report('expression', FUD1143(this.#span(property)));
        else this.#expression(child(property, 'value')!);
      }
    }
  }

  // ── The places of the view that add a rule of their own ──

  /**
   * The value of a `.prop`. A callback — the whole value an arrow, or a function of `@code`
   * handed by name — is browser code like a handler (§3.1, §3.11); anything else is a value of
   * the view, and the one place `t()` may be written.
   */
  #propValue(node: OxcNode): void {
    const value = inner(node);
    const callback =
      value.type === 'ArrowFunctionExpression' ||
      value.type === 'FunctionExpression' ||
      (value.type === 'Identifier' &&
        this.#view.resolve(nameOf(value), this.#template) === 'code' &&
        this.#view.isFunction(nameOf(value)));
    if (callback) {
      this.#handler(node);
      return;
    }
    this.#prop = true;
    this.#expression(node);
  }

  /**
   * The value of an `@event`, a `bus:` or a callback (§3.11): full TypeScript that runs later,
   * in the browser. It keeps one rule of SDD-51: it does not read what an `@{ }` declared,
   * which lives in the pass and not where the handler runs. What nothing declares is TS2304.
   */
  #handler(node: OxcNode): void {
    for (const reference of freeReferenceNodes([node])) {
      const name = nameOf(reference);
      if (!name.startsWith('$') && this.#view.inline(name, this.#template)) {
        this.#report('identifier', FUD0907(this.#span(reference)));
      }
    }
  }

  /** A `case` matches a literal (`FUD1148`); one that is, is checked like any value (§3.7). */
  #case(node: OxcNode): void {
    if (!isCaseLiteral(node)) {
      this.#report('control', FUD1148(this.#span(node)));
      return;
    }
    this.#expression(node);
  }

  /**
   * A `@while` header: it ends only when an `@{ }` of its body writes a name it reads. A call
   * no longer counts as a way out: in the portable view a call reads, it never writes (`FUD0913`).
   */
  #while(node: OxcNode): void {
    this.#expression(node);
    const writes = this.#fragment.bodyWrites!;
    const ends = !alwaysTrue(node) && [...readNames(node)].some((name) => writes.has(name));
    if (!ends) this.#report('expression', FUD0913(this.#span(node)));
  }

  // ── Headers of `@for` / `@foreach` ──

  #header(node: OxcNode): void {
    if (node.type === 'ForStatement') {
      this.#forHeader(node);
      return;
    }
    this.#expression(child(node, 'right')!);
    const left = child(node, 'left')!;
    if (left.type !== 'VariableDeclaration') {
      // `@foreach (x of xs)` writes a name that lives somewhere else.
      this.#report('expression', FUD0900(this.#span(left)));
      return;
    }
    if (this.#headerVar(left)) return;
    for (const declaration of children(left, 'declarations')) this.#pattern(child(declaration, 'id')!, true);
  }

  /** `var` in a header leaks into the render function, like `@{ var }` would (`FUD0908`). */
  #headerVar(declaration: OxcNode): boolean {
    if (field(declaration, 'kind') !== 'var') return false;
    this.#report('statement', FUD0908({ ...this.#keyword(declaration, 'var'), keyword: 'var' }));
    return true;
  }

  /** `let i = 0; c; step`: init and step write only what THIS header declares (§3.7). */
  #forHeader(node: OxcNode): void {
    const own = new Set<string>();
    const init = child(node, 'init');
    if (init?.type === 'VariableDeclaration') {
      if (this.#headerVar(init)) return;
      for (const declaration of children(init, 'declarations')) {
        const value = child(declaration, 'init');
        if (value !== undefined) this.#expression(value);
        const id = child(declaration, 'id')!;
        for (const name of patternNames(id)) own.add(name);
        this.#pattern(id, true);
      }
    } else if (init !== undefined) {
      this.#step(init, own);
    }
    const test = child(node, 'test');
    if (test !== undefined) this.#expression(test);
    const update = child(node, 'update');
    if (update !== undefined) this.#step(update, own);
  }

  /** An init or step of a `@for`: `i++`, `i--`, `i += e`, `i -= e`, `i = e` on its own names. */
  #step(node: OxcNode, own: ReadonlySet<string>): void {
    if (node.type !== 'AssignmentExpression' && node.type !== 'UpdateExpression') {
      this.#expression(node);
      return;
    }
    const assignment = node.type === 'AssignmentExpression';
    const leaf = child(node, assignment ? 'left' : 'argument')!;
    if (leaf.type !== 'Identifier' || !own.has(nameOf(leaf))) {
      this.#report('expression', FUD0900(this.#span(node)));
      return;
    }
    if (assignment) this.#assignment(node, STEP);
  }

  /** The value of an assignment, once its operator is one `allowed` holds (§3.7). */
  #assignment(node: OxcNode, allowed: ReadonlySet<string>): boolean {
    const operator = String(field(node, 'operator'));
    const right = child(node, 'right')!;
    if (!allowed.has(operator)) {
      this.#report('expression', FUD1142({ ...this.#between(child(node, 'left')!, right, operator), operator }));
      return false;
    }
    this.#expression(right);
    return true;
  }

  // ── Patterns (§3.6) ──

  /**
   * A binding pattern of the template: object patterns, nested, renamed, with defaults and a
   * `...rest`. An array pattern or a computed key is `FUD1146`; a type annotation, `FUD1144`.
   */
  #pattern(node: OxcNode, template: boolean): void {
    const annotation = child(node, 'typeAnnotation');
    if (annotation !== undefined) this.#report('expression', FUD1144(this.#span(annotation)));
    switch (node.type) {
      case 'Identifier':
        this.#declare(node, template, 'plain');
        return;
      case 'ObjectPattern':
        for (const property of children(node, 'properties')) {
          if (property.type === 'RestElement') {
            this.#declare(child(property, 'argument')!, template, 'rest');
          } else if (field(property, 'computed') === true) {
            this.#report('expression', FUD1146(this.#span(property)));
          } else {
            this.#pattern(child(property, 'value')!, template);
          }
        }
        return;
      case 'AssignmentPattern':
        this.#expression(child(node, 'right')!);
        this.#pattern(child(node, 'left')!, template);
        return;
      default:
        // `ArrayPattern`: the contract has no tuples (§3.6).
        this.#report('expression', FUD1146(this.#span(node)));
    }
  }

  // ── Statements of `@{ }` (§3.7) and its writes (SDD-51 §3.5) ──

  #statement(node: OxcNode): void {
    switch (node.type) {
      case 'VariableDeclaration':
        this.#declaration(node);
        return;
      case 'ExpressionStatement':
        this.#effect(child(node, 'expression')!);
        return;
      case 'EmptyStatement':
        return;
      case 'FunctionDeclaration':
      case 'ClassDeclaration':
        this.#report('statement', FUD0905(this.#span(node)));
        return;
      case 'TSTypeAliasDeclaration':
      case 'TSInterfaceDeclaration':
        this.#report('statement', FUD1144(this.#span(node)));
        return;
      case 'LabeledStatement': {
        const at = child(node, 'label')!;
        this.#report('statement', FUD0908({ ...this.#span(at), keyword: `${this.#text(at)}:` }));
        return;
      }
      default: {
        // `if`, `switch`, the loops, a block, `return`, `throw`, `try`… and whatever else.
        const keyword = this.#firstWord(node);
        this.#report('statement', FUD0908({ ...this.#keyword(node, keyword), keyword }));
      }
    }
  }

  /** `const` / `let` declare; `var` leaks out of the block, `using` disposes. */
  #declaration(node: OxcNode): void {
    const kind = String(field(node, 'kind'));
    if (kind !== 'const' && kind !== 'let') {
      const keyword = this.#firstWord(node);
      if (kind === 'await using') this.#report('expression', FUD0902(this.#keyword(node, keyword)));
      else this.#report('statement', FUD0908({ ...this.#keyword(node, keyword), keyword }));
      return;
    }
    for (const declaration of children(node, 'declarations')) {
      const id = child(declaration, 'id')!;
      const value = child(declaration, 'init');
      // `const { b, ...r2 } = rest` destructures a rest again: one of its three uses (§3.6).
      if (value?.type === 'Identifier' && id.type === 'ObjectPattern') this.#read(value, true);
      else if (value !== undefined) this.#expression(value);
      this.#pattern(id, true);
    }
  }

  /**
   * An expression in statement position: only a reassignment of a variable (§3.7). A write that
   * reads the value it replaces — `+=`, `++`, `x = x + 1` — ACCUMULATES, and is only a pass's
   * own once an earlier `@{ }` of the pass has reseeded the name (SDD-51 §3.8).
   */
  #effect(statement: OxcNode): void {
    // `({ a } = o);` needs its parentheses to be a statement at all: they change nothing.
    const expr = inner(statement);
    if (expr.type === 'AssignmentExpression') {
      if (!this.#assignment(expr, ASSIGNMENT)) return;
      const left = child(expr, 'left')!;
      const self = left.type === 'Identifier' && readsName(child(expr, 'right'), nameOf(left));
      const accumulates = field(expr, 'operator') !== '=' || self;
      this.#write(left, accumulates);
      if (left.type === 'Identifier' && !accumulates) this.#seeded.add(nameOf(left));
      return;
    }
    if (expr.type === 'UpdateExpression') {
      this.#write(child(expr, 'argument')!, true);
      return;
    }
    const keyword = this.#text(expr.type === 'CallExpression' ? child(expr, 'callee')! : expr);
    this.#report('statement', FUD0908({ ...this.#span(expr), keyword }));
  }

  /**
   * The target of a write: a variable, never a member (`FUD0900`), and one the template may
   * reassign — an `@{ }` `let` or a neutral `let` (`FUD0901`). A destructuring target is judged
   * leaf by leaf, with no array pattern (`FUD1146`).
   */
  #write(target: OxcNode, accumulates: boolean): void {
    switch (target.type) {
      case 'Identifier': {
        const name = nameOf(target);
        if (this.#local(name) !== undefined) return;
        const origin = this.#view.resolve(name, this.#template);
        if (origin === 'neutral-let') {
          const seeded = this.#seeded.has(name) || this.#view.seeded(name, this.#template);
          if (accumulates && !seeded) this.#report('statement', FUD0900(this.#span(target)));
        } else if (origin !== 'template') {
          this.#report('statement', FUD0901(this.#span(target)));
        }
        return;
      }
      case 'ObjectPattern':
        for (const property of children(target, 'properties')) {
          this.#write(child(property, property.type === 'RestElement' ? 'argument' : 'value')!, false);
        }
        return;
      case 'AssignmentPattern':
        this.#expression(child(target, 'right')!);
        this.#write(child(target, 'left')!, false);
        return;
      case 'ArrayPattern':
        this.#report('expression', FUD1146(this.#span(target)));
        return;
      default:
        // A member, `(a.b)`, `a!`: a write that lands somewhere the template does not own.
        this.#report('statement', FUD0900(this.#span(target)));
    }
  }

  // ── Source text, for the keyword a FUD0908 names and underlines ──

  #firstWord(node: OxcNode): string {
    // A statement opens with its keyword (`return`, `using`…), or with `{` when it is a block.
    return /^[A-Za-z_$][\w$]*(?:\s+using)?/u.exec(this.#text(node))?.[0] ?? '{';
  }

  /** The span of the statement's opening keyword, not of the whole statement. */
  #keyword(node: OxcNode, keyword: string): { readonly span: Span } {
    return { span: this.#range(node.start, node.start + keyword.length) };
  }
}
