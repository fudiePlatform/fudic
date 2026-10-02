/**
 * What the JS of the view may DO (SDD-51 §3.2–§3.5, §3.8): one walk over the Oxc AST of every
 * fragment, by WHITE list.
 *
 * Each node is matched against the forms the spec enumerates; a form that is not there is an
 * error, so whatever Oxc learns to parse tomorrow is refused by default. A forbidden node is
 * reported once and NOT descended into — `@(async () => await x)` is one finding, not two —
 * while its siblings still are, so a file with three faults shows the three (§4.3).
 *
 * The three analyzers share this walk and split its findings by `rule`, because they are three
 * readings of one traversal: what an expression may be, what an `@{ }` may hold, and what a
 * free name may resolve to. Walking three times would be three chances to disagree about
 * where a scope opens. The findings are memoized per input, so the walk runs once per pass.
 *
 * Never throws: an AST of an unexpected shape is a node not on the list, not an exception.
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
  FUD0911,
  FUD0912,
  FUD0913,
  FUD0917,
  FUD0918,
  FUD0919,
} from '@fudic/diagnostics';
import { freeReferenceNodes } from '../emit/scope.js';
import { walkPattern, type OxcNode } from '../oxc/index.js';
import type { Diagnostic, Span } from '../types/index.js';
import type { SemanticInput } from './model.js';
import {
  NO_TEMPLATE,
  readsName,
  viewScope,
  type TemplateScope,
  type ViewFragment,
  type ViewScope,
} from './view-scope.js';

/** Which analyzer reports a finding: the expression list, the `@{ }` list, or free names. */
export type ViewRule = 'expression' | 'statement' | 'identifier';

export interface ViewFinding {
  readonly rule: ViewRule;
  readonly diagnostic: Diagnostic;
}

const memo = new WeakMap<SemanticInput, readonly ViewFinding[]>();

/** Every finding of the view of `input`, computed once per input. */
export function viewFindings(input: SemanticInput): readonly ViewFinding[] {
  let findings = memo.get(input);
  if (findings === undefined) {
    const view = viewScope(input);
    const out: ViewFinding[] = [];
    for (const fragment of view.fragments) new FragmentCheck(input, view, fragment, out).run();
    findings = out;
    memo.set(input, findings);
  }
  return findings;
}

// ── Typed access over the untyped Oxc node ──
function isNode(value: unknown): value is OxcNode {
  return typeof value === 'object' && value !== null && typeof (value as OxcNode).type === 'string';
}
const field = (node: OxcNode, key: string): unknown => node[key];
const child = (node: OxcNode, key: string): OxcNode | undefined => {
  const value = node[key];
  return isNode(value) ? value : undefined;
};
/** A list field of the node, holes dropped: `[, a]` has an element that is no node. */
const children = (node: OxcNode, key: string): readonly OxcNode[] =>
  (node[key] as readonly unknown[]).filter(isNode);
const nameOf = (node: OxcNode): string => String(node['name']);

/**
 * The wrappers TypeScript erases and the parentheses `preserveParens` keeps: none of them
 * changes what the expression inside does, so the walk sees through them.
 */
const TRANSPARENT: ReadonlySet<string> = new Set([
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression',
]);

function unwrap(node: OxcNode): OxcNode {
  let current = node;
  for (let inner = child(current, 'expression'); TRANSPARENT.has(current.type) && inner; ) {
    current = inner;
    inner = child(current, 'expression');
  }
  return current;
}

// ── What §3.8 adds to the list, by name (a closed list each: no types, no guessing) ──

/** Members that reach the machinery of a value: `Function`, the prototypes. */
const REFLECTIVE: ReadonlySet<string> = new Set(['constructor', '__proto__', 'prototype']);
/** `Global.member` pairs that are reflective too: `Symbol.for` forges a `trustedUrl`. */
const REFLECTIVE_STATICS: ReadonlySet<string> = new Set([
  'Symbol.for',
  'Symbol.keyFor',
  'Object.getPrototypeOf',
  'Object.setPrototypeOf',
]);
/** Methods that write the object they are called on. `set…` of `Date` by its prefix. */
const MUTATORS: ReadonlySet<string> = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
  'set',
  'add',
  'delete',
  'clear',
]);
/** `Object.x(target, …)` that write their first argument. */
const OBJECT_MUTATORS: ReadonlySet<string> = new Set([
  'assign',
  'defineProperty',
  'defineProperties',
  'freeze',
  'seal',
  'preventExtensions',
]);
/** Getters of a `Date` in the process's own time zone: each side answers with its own. */
const LOCAL_TIME: ReadonlySet<string> = new Set([
  'getFullYear',
  'getMonth',
  'getDate',
  'getDay',
  'getHours',
  'getMinutes',
  'getSeconds',
  'getTimezoneOffset',
  'toDateString',
  'toTimeString',
]);
/** How many arguments make a locale-aware call deterministic: the locale, and the time zone. */
const LOCALE_ARGS: ReadonlyMap<string, number> = new Map([
  ['toLocaleString', 1],
  ['toLocaleDateString', 2],
  ['toLocaleTimeString', 2],
  ['toLocaleUpperCase', 1],
  ['toLocaleLowerCase', 1],
  ['localeCompare', 2],
]);
/** The promise methods: the callback runs after the pass. */
const DEFERRED: ReadonlySet<string> = new Set(['then', 'catch', 'finally']);
/** The string methods that build a regex out of their argument. */
const REGEX_METHODS: ReadonlySet<string> = new Set(['match', 'matchAll', 'search']);
/** The regex methods that read and move `lastIndex`. */
const REGEX_STATE: ReadonlySet<string> = new Set(['test', 'exec']);
/** The largest `Array(n)` the view may allocate with a literal `n`. */
const MAX_ARRAY = 10_000;
/** A key the reconciliation can match: a value, never a fresh object. */
const FRESH: ReadonlySet<string> = new Set([
  'ObjectExpression',
  'ArrayExpression',
  'ArrowFunctionExpression',
  'FunctionExpression',
  'ClassExpression',
  'NewExpression',
]);

/** The name of a member: `a.b` → `b`, `a["b"]` → `b`, `a[x]` → `undefined`. */
function memberName(node: OxcNode): string | undefined {
  const property = child(node, 'property')!;
  if (field(node, 'computed') !== true) return nameOf(property);
  return typeof field(property, 'value') === 'string' ? String(field(property, 'value')) : undefined;
}

/** `Global.member`, when the object is a bare name: `Math.random` → `'Math.random'`. */
function staticName(node: OxcNode): string | undefined {
  const object = child(node, 'object');
  const member = memberName(node);
  if (object === undefined || member === undefined) return undefined;
  const base = unwrap(object);
  return base.type === 'Identifier' ? `${nameOf(base)}.${member}` : undefined;
}

/** The name an object chain hangs from — `data.items[0]` → `data` — or none for a fresh value. */
function rootName(node: OxcNode): OxcNode | undefined {
  let current = unwrap(node);
  while (current.type === 'MemberExpression' || current.type === 'ChainExpression') {
    current = unwrap(child(current, current.type === 'MemberExpression' ? 'object' : 'expression')!);
  }
  return current.type === 'Identifier' ? current : undefined;
}

/** A value that is always truthy: `true`, `1`, `'x'`, `{}`, `[]`. */
function alwaysTrue(node: OxcNode): boolean {
  const value = unwrap(node);
  if (value.type === 'ObjectExpression' || value.type === 'ArrayExpression') return true;
  return value.type === 'Literal' && field(value, 'regex') == null && Boolean(field(value, 'value'));
}

/** A `for` condition that never ends the loop: none at all, or one always true. */
function forever(test: OxcNode | undefined): boolean {
  return test === undefined || alwaysTrue(test);
}

/** Whether a statement holds a `break` anywhere: a loop with one has an exit. */
function hasBreak(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasBreak);
  if (!isNode(node)) return false;
  if (node.type === 'BreakStatement') return true;
  return Object.keys(node).some((key) => hasBreak(node[key]));
}

/** Whether an expression can change anything while it is evaluated: a call or a write. */
function acts(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(acts);
  if (!isNode(node)) return false;
  if (/^(Call|New|Assignment|Update|TaggedTemplate)Expression$/u.test(node.type)) return true;
  return Object.keys(node).some((key) => acts(node[key]));
}

/** The names an expression reads: identifiers, never a member's name or an object's key. */
function readNames(node: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) readNames(item, out);
    return out;
  }
  if (!isNode(node)) return out;
  if (node.type === 'Identifier') {
    out.add(nameOf(node));
    return out;
  }
  for (const key of Object.keys(node)) {
    const named = (key === 'property' || key === 'key') && field(node, 'computed') !== true;
    if (!named) readNames(node[key], out);
  }
  return out;
}

/** The checks over one fragment. Lives as long as the fragment's walk. */
class FragmentCheck {
  readonly #input: SemanticInput;
  readonly #view: ViewScope;
  readonly #fragment: ViewFragment;
  readonly #template: TemplateScope;
  readonly #out: ViewFinding[];
  /** What the fragment declares itself: arrow parameters, `@{ }` bindings, `for` heads. */
  readonly #frames: Set<string>[] = [];
  /** The neutral `let`s this `@{ }` has already reassigned plainly, in its own order. */
  readonly #seeded = new Set<string>();
  /** Loops and switches of the fragment's own, for `break` / `continue` (§3.3). */
  #loops = 0;
  #switches = 0;

  constructor(input: SemanticInput, view: ViewScope, fragment: ViewFragment, out: ViewFinding[]) {
    this.#input = input;
    this.#view = view;
    this.#fragment = fragment;
    this.#template = fragment.scope;
    this.#out = out;
  }

  run(): void {
    const { root, shape } = this.#fragment;
    this.#frames.push(new Set());
    switch (shape) {
      case 'statements':
        for (const statement of root as readonly OxcNode[]) this.#statement(statement);
        break;
      case 'handler':
        this.#handler(root as OxcNode);
        break;
      case 'key':
        this.#key(root as OxcNode);
        break;
      case 'while':
        this.#while(root as OxcNode);
        break;
      case 'prop':
        this.#prop(root as OxcNode);
        break;
      case 'expression':
        this.#expression(root as OxcNode);
        break;
      default:
        this.#header(root as OxcNode);
    }
    this.#frames.pop();
  }

  // ── Reporting ──

  #span(node: OxcNode): { readonly span: Span } {
    return { span: this.#input.js.mapSpan(node.start, node.end) };
  }

  #report(rule: ViewRule, diagnostic: Diagnostic): void {
    this.#out.push({ rule, diagnostic });
  }

  // ── Names ──

  #local(name: string): boolean {
    return this.#frames.some((frame) => frame.has(name));
  }

  #scoped(body: () => void): void {
    this.#frames.push(new Set());
    body();
    this.#frames.pop();
  }

  /**
   * Declare a name. A name the TEMPLATE declares — an `@{ }` binding, a loop header — lands in
   * the render function next to `@code`'s, so it may neither take the `$` of the emit
   * (`FUD0461`) nor redeclare what `@code`, the role or the globals already name (`FUD0918`).
   * An arrow parameter is scoped to its arrow and only declares.
   */
  #declare(node: OxcNode, template: boolean): void {
    const name = nameOf(node);
    if (template) {
      if (name.startsWith('$')) this.#report('statement', FUD0461({ ...this.#span(node), name }));
      else if (this.#outside(name)) this.#report('statement', FUD0918(this.#span(node)));
    }
    this.#frames[this.#frames.length - 1]!.add(name);
  }

  /** Whether a name means something outside the template: `@code`, the role, a global. */
  #outside(name: string): boolean {
    return this.#view.resolve(name, NO_TEMPLATE) !== undefined;
  }

  /** Bind what a pattern declares; the defaults and computed keys inside it are reads. */
  #bind(pattern: unknown, template: boolean): void {
    walkPattern(pattern, {
      name: (node) => this.#declare(node, template),
      expression: (node) => {
        this.#expression(node as OxcNode);
      },
    });
  }

  /** A name READ by the view (§3.4, §3.8). */
  #read(node: OxcNode): void {
    const name = nameOf(node);
    if (this.#local(name)) return;
    if (name === 'arguments') {
      this.#report('expression', FUD0904(this.#span(node)));
      return;
    }
    if (name === 'RegExp') {
      this.#report('expression', FUD0919(this.#span(node)));
      return;
    }
    // A `@server` name is TypeScript's to report (TS2304: the projection never sees that zone),
    // and one fact has one voice (BUG-23). A plain `@client` name the projection DOES see, so
    // that one is this rule's: the server renders without it.
    const origin = this.#view.resolve(name, this.#template);
    if (origin === undefined || origin === 'client') this.#report('identifier', FUD0907(this.#span(node)));
  }

  /** Whether `node` names a function of `@code` — printing it prints its source (§3.8). */
  #isFunction(node: OxcNode): boolean {
    const value = unwrap(node);
    if (value.type !== 'Identifier') return false;
    const name = nameOf(value);
    return this.#view.resolve(name, this.#template) === 'code' && !this.#local(name) && this.#view.isFunction(name);
  }

  /** Whether `node` names a regex of `@code`: a `test` on it moves its `lastIndex` (§3.8). */
  #regex(node: OxcNode): boolean {
    const value = unwrap(node);
    return value.type === 'Identifier' && !this.#local(nameOf(value)) && this.#view.isRegex(nameOf(value));
  }

  /** Whether the pass itself built what `root` names: an `@{ }` binding, or a local. */
  #owned(root: OxcNode | undefined): boolean {
    if (root === undefined) return true;
    const name = nameOf(root);
    return this.#local(name) || this.#view.inline(name, this.#template);
  }

  // ── Expressions (§3.2, §3.8) ──

  #expression(node: OxcNode): void {
    switch (node.type) {
      case 'Identifier':
        this.#read(node);
        return;
      case 'Literal':
        if (field(node, 'regex') != null) this.#report('expression', FUD0919(this.#span(node)));
        return;
      case 'TemplateLiteral':
        for (const part of children(node, 'expressions')) this.#printed(part);
        return;
      case 'TaggedTemplateExpression':
        // A call whose arguments are not written anywhere (§3.8).
        this.#report('expression', FUD0905(this.#span(child(node, 'tag')!)));
        return;
      case 'MemberExpression':
        this.#member(node);
        return;
      case 'ChainExpression':
      case 'ParenthesizedExpression':
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'TSTypeAssertion':
      case 'TSInstantiationExpression':
        // Only the expression: a type annotation is not a value and names nothing to read.
        this.#optional(child(node, 'expression'));
        return;
      case 'CallExpression':
      case 'NewExpression':
        if (this.#call(node)) return;
        this.#optional(child(node, 'callee'));
        this.#each(children(node, 'arguments'));
        return;
      case 'SpreadElement':
        this.#optional(child(node, 'argument'));
        return;
      case 'UnaryExpression':
        if (field(node, 'operator') === 'delete') {
          this.#report('expression', FUD0900(this.#span(node)));
          return;
        }
        this.#optional(child(node, 'argument'));
        return;
      case 'BinaryExpression':
        if (field(node, 'operator') === '+') {
          this.#printed(child(node, 'left')!);
          this.#printed(child(node, 'right')!);
          return;
        }
        this.#optional(child(node, 'left'));
        this.#optional(child(node, 'right'));
        return;
      case 'LogicalExpression':
        this.#optional(child(node, 'left'));
        this.#optional(child(node, 'right'));
        return;
      case 'ConditionalExpression':
        this.#optional(child(node, 'test'));
        this.#optional(child(node, 'consequent'));
        this.#optional(child(node, 'alternate'));
        return;
      case 'ArrayExpression':
        this.#each(children(node, 'elements'));
        return;
      case 'ObjectExpression':
        for (const property of children(node, 'properties')) this.#property(property);
        return;
      case 'ArrowFunctionExpression':
        this.#arrow(node);
        return;
      case 'FunctionExpression':
        this.#report('expression', (field(node, 'async') === true ? FUD0902 : FUD0905)(this.#span(node)));
        return;
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
        this.#report('expression', FUD0903(this.#span(node)));
        return;
      case 'MetaProperty':
        // `import.meta`. Its sibling `new.target` is no syntax outside a function, and the view
        // has none to be inside of: Oxc refuses it first (FUD0170).
        this.#report('expression', FUD0903(this.#span(node)));
        return;
      case 'ThisExpression':
      case 'Super':
        this.#report('expression', FUD0904(this.#span(node)));
        return;
      case 'SequenceExpression':
        this.#report('expression', FUD0906(this.#span(node)));
        return;
      // Not on the list (§5): refused, as code the view has no business holding. Every
      // expression Oxc parses today is one of the cases above; this is for tomorrow's.
      /* v8 ignore next 2 */
      default:
        this.#report('expression', FUD0905(this.#span(node)));
    }
  }

  #optional(node: OxcNode | undefined): void {
    if (node !== undefined) this.#expression(node);
  }

  /** A list of expressions: arguments, elements, template parts. A hole is nothing. */
  #each(nodes: readonly OxcNode[]): void {
    for (const node of nodes) this.#expression(node);
  }

  /** A value turned into text: a function of `@code` there prints its source (`FUD0917`). */
  #printed(node: OxcNode): void {
    if (this.#isFunction(node)) this.#report('expression', FUD0917(this.#span(node)));
    else this.#expression(node);
  }

  /** `a.b`: the machinery (`FUD0910`) and a stack trace (`FUD0917`) are not values. */
  #member(node: OxcNode): void {
    const property = child(node, 'property')!;
    const name = memberName(node);
    const whole = staticName(node);
    if ((name !== undefined && REFLECTIVE.has(name)) || (whole !== undefined && REFLECTIVE_STATICS.has(whole))) {
      this.#report('expression', FUD0910(this.#span(property)));
      return;
    }
    if (name === 'stack') {
      this.#report('expression', FUD0917(this.#span(property)));
      return;
    }
    this.#optional(child(node, 'object'));
    if (field(node, 'computed') === true) this.#expression(property);
  }

  /**
   * The calls §3.8 decides by name. Reports and answers `true` when the call is one of them,
   * so the caller does not descend into it (§4.3).
   */
  #call(node: OxcNode): boolean {
    const callee = unwrap(child(node, 'callee')!);
    const args = children(node, 'arguments');
    const fresh = node.type === 'NewExpression';
    if (callee.type === 'Identifier') return this.#callName(node, callee, args, fresh);
    if (callee.type !== 'MemberExpression') return false;
    const property = child(callee, 'property')!;
    const method = memberName(callee);
    const whole = staticName(callee);
    const at = this.#span(property);
    if (method === undefined) return false;
    if (whole !== undefined && REFLECTIVE_STATICS.has(whole)) return this.#flag(FUD0910(at));
    if (REFLECTIVE.has(method)) return false;
    if (whole === 'Math.random' || whole === 'Date.now') return this.#flag(FUD0912(this.#span(node)));
    if (whole?.startsWith('Intl.') === true && args.length === 0) return this.#flag(FUD0912(this.#span(node)));
    if (whole === 'Array.fromAsync' || DEFERRED.has(method)) return this.#flag(FUD0902(at));
    if (REGEX_METHODS.has(method) || (REGEX_STATE.has(method) && this.#regex(child(callee, 'object')!))) {
      return this.#flag(FUD0919(at));
    }
    if (LOCAL_TIME.has(method)) return this.#flag(FUD0912(this.#span(node)));
    const locale = LOCALE_ARGS.get(method);
    if (locale !== undefined && args.length < locale) return this.#flag(FUD0912(this.#span(node)));
    if (whole?.startsWith('Object.') === true && OBJECT_MUTATORS.has(method)) {
      const target = args[0];
      return target !== undefined && !this.#owned(rootName(target)) ? this.#flag(FUD0911(at)) : false;
    }
    if (MUTATORS.has(method) || /^set[A-Z]/u.test(method)) {
      return this.#owned(rootName(child(callee, 'object')!)) ? false : this.#flag(FUD0911(at));
    }
    if (method === 'toString' && args.length === 0 && this.#isFunction(child(callee, 'object')!)) {
      return this.#flag(FUD0917(this.#span(child(callee, 'object')!)));
    }
    return false;
  }

  /** A call or `new` of a bare name: `Symbol()`, `Date()`, `Array(n)`, `String(f)`. */
  #callName(node: OxcNode, callee: OxcNode, args: readonly OxcNode[], fresh: boolean): boolean {
    const name = nameOf(callee);
    if (this.#local(name) || this.#view.resolve(name, this.#template)?.startsWith('template')) return false;
    if (name === 'Symbol' && !fresh) return this.#flag(FUD0912(this.#span(node)));
    if (name === 'Date' && (!fresh || args.length === 0)) return this.#flag(FUD0912(this.#span(node)));
    const first = args[0];
    if (first === undefined || args.length > 1) return false;
    if (name === 'Array' && !this.#small(first)) return this.#flag(FUD0913(this.#span(callee)));
    if (name === 'String' && this.#isFunction(first)) return this.#flag(FUD0917(this.#span(first)));
    return false;
  }

  /** A numeric literal no larger than what a view may allocate. */
  #small(arg: OxcNode): boolean {
    const value = field(unwrap(arg), 'value');
    return typeof value === 'number' && value <= MAX_ARRAY;
  }

  #flag(diagnostic: Diagnostic): true {
    this.#report('expression', diagnostic);
    return true;
  }

  /** `key: value` and `key` are values; a method, getter or setter defines code (§3.2). */
  #property(property: OxcNode): void {
    if (property.type === 'SpreadElement') {
      this.#optional(child(property, 'argument'));
      return;
    }
    if (property.type !== 'Property' || field(property, 'method') === true || field(property, 'kind') !== 'init') {
      this.#report('expression', FUD0905(this.#span(property)));
      return;
    }
    if (field(property, 'computed') === true) this.#optional(child(property, 'key'));
    this.#optional(child(property, 'value'));
  }

  /** An arrow is a value only with an expression body, and never `async` (§3.2). */
  #arrow(node: OxcNode): void {
    if (field(node, 'async') === true) {
      this.#report('expression', FUD0902(this.#span(node)));
      return;
    }
    if (field(node, 'expression') !== true) {
      this.#report('expression', FUD0905(this.#span(node)));
      return;
    }
    this.#scoped(() => {
      for (const param of children(node, 'params')) this.#bind(param, false);
      this.#optional(child(node, 'body'));
    });
  }

  // ── The places of the view that add a rule of their own (§3.8) ──

  /** A `key`: a value the reconciliation can match, never a fresh object (`FUD0912`). */
  #key(node: OxcNode): void {
    if (FRESH.has(unwrap(node).type)) {
      this.#report('expression', FUD0912(this.#span(node)));
      return;
    }
    this.#expression(node);
  }

  /**
   * A `@while` header: it ends only if something can change what it reads — a call, or an
   * `@{ }` of its body that writes one of its names. Neither, and it runs forever (`FUD0913`).
   */
  #while(node: OxcNode): void {
    this.#expression(node);
    const writes = this.#fragment.bodyWrites!;
    const ends = !alwaysTrue(node) && (acts(node) || [...readNames(node)].some((name) => writes.has(name)));
    if (!ends) this.#report('expression', FUD0913(this.#span(node)));
  }

  /**
   * The value of an `@event` or `bus:` binding (§3.8): it runs later, in the browser, so it
   * may do anything an effect does — but the names it reads are the view's names. What nobody
   * declares, and what an `@{ }` declared — which lives in the pass, not where the handler
   * runs — is `FUD0907`. The `$` names are `FUD0666`'s, and `@server`'s TypeScript's.
   */
  #handler(node: OxcNode): void {
    for (const reference of freeReferenceNodes([node])) {
      const name = nameOf(reference);
      if (name.startsWith('$')) continue;
      const origin = this.#view.resolve(name, this.#template);
      if (origin === undefined || this.#view.inline(name, this.#template)) {
        this.#report('identifier', FUD0907(this.#span(reference)));
      }
    }
  }

  /**
   * The value of a `.prop`: a function of `@client` handed to a child BY NAME is the one plain
   * `@client` name the server has — it stubs the callback inert to register its identity
   * (BUG-24 §4.6). Anything else is an expression like any other.
   */
  #prop(node: OxcNode): void {
    const value = unwrap(node);
    if (value.type === 'Identifier' && this.#view.resolve(nameOf(value), this.#template) === 'client') return;
    this.#expression(node);
  }

  // ── Headers of `@for` / `@foreach` (§3.2, the one exception to FUD0900) ──

  #header(node: OxcNode): void {
    if (node.type === 'ForStatement') {
      this.#forHeader(node);
      return;
    }
    // `for-of-header` (and a `for…in` someone wrote in a `@foreach`, which is not this rule's).
    // A header is `( … )` and nothing else: `for await` has nowhere to be written.
    this.#optional(child(node, 'right'));
    const left = child(node, 'left')!;
    if (left.type === 'VariableDeclaration') {
      if (this.#headerVar(left)) return;
      for (const declaration of children(left, 'declarations')) this.#bind(field(declaration, 'id'), true);
    } else {
      // `@foreach (x of xs)` writes a name that lives somewhere else.
      this.#report('expression', FUD0900(this.#span(left)));
    }
  }

  /** `var` in a header leaks into the render function, like `@{ var }` would (`FUD0908`). */
  #headerVar(declaration: OxcNode): boolean {
    if (field(declaration, 'kind') !== 'var') return false;
    this.#report('statement', FUD0908({ ...this.#keyword(declaration, 'var'), keyword: 'var' }));
    return true;
  }

  /** `let i = 0; i < n; i++`: init and update may write what THIS header declares, only. */
  #forHeader(node: OxcNode): void {
    const own = new Set<string>();
    const init = child(node, 'init');
    if (init?.type === 'VariableDeclaration') {
      if (this.#headerVar(init)) return;
      for (const declaration of children(init, 'declarations')) {
        this.#optional(child(declaration, 'init'));
        walkPattern(field(declaration, 'id'), {
          name: (name) => {
            own.add(nameOf(name));
            this.#declare(name, true);
          },
          expression: (expr) => this.#expression(expr as OxcNode),
        });
      }
    } else if (init !== undefined) {
      this.#headerWrite(init, own);
    }
    this.#optional(child(node, 'test'));
    const update = child(node, 'update');
    if (update !== undefined) this.#headerWrite(update, own);
  }

  /** An init or update of a `@for`: a write is fine when its target is the header's own. */
  #headerWrite(node: OxcNode, own: ReadonlySet<string>): void {
    const expr = unwrap(node);
    if (expr.type === 'AssignmentExpression' || expr.type === 'UpdateExpression') {
      const leaf = unwrap(child(expr, expr.type === 'AssignmentExpression' ? 'left' : 'argument')!);
      if (leaf.type === 'Identifier' && own.has(nameOf(leaf))) {
        if (expr.type === 'AssignmentExpression') this.#optional(child(expr, 'right'));
        return;
      }
      this.#report('expression', FUD0900(this.#span(expr)));
      return;
    }
    this.#expression(node);
  }

  // ── Statements of `@{ }` (§3.3) and its writes (§3.5) ──

  #statement(node: OxcNode): void {
    switch (node.type) {
      case 'VariableDeclaration':
        this.#declaration(node);
        return;
      case 'ExpressionStatement':
        this.#effect(child(node, 'expression'));
        return;
      case 'IfStatement':
        this.#optional(child(node, 'test'));
        this.#body(child(node, 'consequent'));
        this.#body(child(node, 'alternate'));
        return;
      case 'SwitchStatement':
        this.#optional(child(node, 'discriminant'));
        this.#switches++;
        this.#scoped(() => {
          for (const branch of children(node, 'cases')) {
            this.#optional(child(branch, 'test'));
            for (const statement of children(branch, 'consequent')) this.#statement(statement);
          }
        });
        this.#switches--;
        return;
      case 'ForStatement':
        if (this.#endless(node, forever(child(node, 'test')), 'for')) return;
        this.#scoped(() => {
          const init = child(node, 'init');
          if (init?.type === 'VariableDeclaration') this.#declaration(init);
          else this.#effect(init);
          this.#optional(child(node, 'test'));
          this.#effect(child(node, 'update'));
          this.#loop(child(node, 'body'));
        });
        return;
      case 'ForOfStatement':
      case 'ForInStatement':
        if (field(node, 'await') === true) {
          this.#report('expression', FUD0902(this.#keyword(node, 'for await')));
          return;
        }
        this.#scoped(() => {
          this.#optional(child(node, 'right'));
          const left = child(node, 'left')!;
          if (left.type === 'VariableDeclaration') this.#declaration(left, false);
          else this.#write(left, false);
          this.#loop(child(node, 'body'));
        });
        return;
      case 'WhileStatement':
        if (this.#endless(node, alwaysTrue(child(node, 'test')!), 'while')) return;
        this.#optional(child(node, 'test'));
        this.#loop(child(node, 'body'));
        return;
      case 'DoWhileStatement':
        if (this.#endless(node, alwaysTrue(child(node, 'test')!), 'do')) return;
        this.#loop(child(node, 'body'));
        this.#optional(child(node, 'test'));
        return;
      case 'BreakStatement':
      case 'ContinueStatement': {
        const keyword = node.type === 'BreakStatement' ? 'break' : 'continue';
        const inside = node.type === 'BreakStatement' ? this.#loops + this.#switches > 0 : this.#loops > 0;
        if (child(node, 'label') !== undefined || !inside) {
          this.#report('statement', FUD0908({ ...this.#keyword(node, keyword), keyword }));
        }
        return;
      }
      case 'BlockStatement':
        this.#scoped(() => {
          for (const statement of children(node, 'body')) this.#statement(statement);
        });
        return;
      case 'EmptyStatement':
      case 'TSTypeAliasDeclaration':
      case 'TSInterfaceDeclaration':
        // A type emits nothing; there is nothing in it to run.
        return;
      case 'FunctionDeclaration':
        this.#report('statement', (field(node, 'async') === true ? FUD0902 : FUD0905)(this.#span(node)));
        return;
      case 'ClassDeclaration':
        this.#report('statement', FUD0905(this.#span(node)));
        return;
      case 'LabeledStatement': {
        const at = child(node, 'label')!;
        this.#report('statement', FUD0908({ ...this.#span(at), keyword: `${this.#text(at)}:` }));
        return;
      }
      default: {
        // `return`, `throw`, `try`, `with`, `debugger`, `enum`, `using`… and whatever else.
        const keyword = this.#firstWord(node);
        this.#report('statement', FUD0908({ ...this.#keyword(node, keyword), keyword }));
      }
    }
  }

  /** A loop whose condition never ends it and whose body never leaves it (`FUD0913`). */
  #endless(node: OxcNode, forever: boolean, keyword: string): boolean {
    if (!forever || hasBreak(child(node, 'body'))) return false;
    this.#report('statement', FUD0913(this.#keyword(node, keyword)));
    return true;
  }

  /** `const` / `let` declare; `var` leaks out of the block, `using` disposes (§3.3). */
  #declaration(node: OxcNode, withInit = true): void {
    const kind = String(field(node, 'kind'));
    if (kind !== 'const' && kind !== 'let') {
      const keyword = this.#firstWord(node);
      const code = kind === 'await using' ? FUD0902 : undefined;
      if (code !== undefined) this.#report('expression', code(this.#keyword(node, keyword)));
      else this.#report('statement', FUD0908({ ...this.#keyword(node, keyword), keyword }));
      return;
    }
    for (const declaration of children(node, 'declarations')) {
      if (withInit) this.#optional(child(declaration, 'init'));
      this.#bind(field(declaration, 'id'), true);
    }
  }

  /** The body of an `if`: one statement or a block, each with its own scope. */
  #body(node: OxcNode | undefined): void {
    if (node === undefined) return;
    this.#scoped(() => this.#statement(node));
  }

  #loop(node: OxcNode | undefined): void {
    this.#loops++;
    this.#body(node);
    this.#loops--;
  }

  /**
   * An expression in statement position — or the init and update of an `@{ }` loop. The one
   * place a write is legal: `total = a + b;`, `i++`, `({ a, b } = obj);` (§3.5). A write that
   * reads the value it replaces — `+=`, `++`, `x = x + 1` — ACCUMULATES, and is only a pass's
   * own when an earlier `@{ }` of the pass has reseeded the name (§3.8).
   */
  #effect(node: OxcNode | undefined): void {
    if (node === undefined) return;
    const expr = unwrap(node);
    if (expr.type === 'AssignmentExpression') {
      const right = child(expr, 'right')!;
      this.#expression(right);
      const left = child(expr, 'left')!;
      const target = unwrap(left);
      const self = target.type === 'Identifier' && readsName(right, nameOf(target));
      const accumulates = field(expr, 'operator') !== '=' || self;
      this.#write(left, accumulates);
      if (target.type === 'Identifier' && !accumulates) this.#seeded.add(nameOf(target));
      return;
    }
    if (expr.type === 'UpdateExpression') {
      this.#write(child(expr, 'argument')!, true);
      return;
    }
    this.#expression(node);
  }

  /**
   * The target of a write in `@{ }`: a variable, never a member (FUD0900), and a variable the
   * template may reassign — an `@{ }` `let` or a neutral `let` (FUD0901); never a loop header,
   * a `const` or a parameter. A destructuring target is judged leaf by leaf; its defaults and
   * computed keys are reads.
   */
  #write(target: OxcNode, accumulates: boolean): void {
    const node = unwrap(target);
    switch (node.type) {
      case 'Identifier': {
        const name = nameOf(node);
        if (this.#local(name)) return;
        const origin = this.#view.resolve(name, this.#template);
        if (origin === 'neutral-let') {
          const seeded = this.#seeded.has(name) || this.#view.seeded(name, this.#template);
          if (accumulates && !seeded) this.#report('statement', FUD0900(this.#span(node)));
        } else if (origin !== 'template') {
          this.#report('statement', FUD0901(this.#span(node)));
        }
        return;
      }
      case 'MemberExpression':
        this.#report('statement', FUD0900(this.#span(node)));
        return;
      case 'ObjectPattern':
        for (const property of children(node, 'properties')) {
          if (property.type === 'RestElement') {
            this.#writeChild(property, 'argument');
            continue;
          }
          if (field(property, 'computed') === true) this.#optional(child(property, 'key'));
          this.#writeChild(property, 'value');
        }
        return;
      case 'ArrayPattern':
        for (const element of children(node, 'elements')) this.#write(element, false);
        return;
      case 'AssignmentPattern':
        this.#optional(child(node, 'right'));
        this.#writeChild(node, 'left');
        return;
      case 'RestElement':
        this.#writeChild(node, 'argument');
        return;
      // Every target Oxc builds today is one of the above; the white list refuses tomorrow's.
      /* v8 ignore next 2 */
      default:
        this.#report('statement', FUD0900(this.#span(node)));
    }
  }

  #writeChild(node: OxcNode, key: string): void {
    this.#write(child(node, key)!, false);
  }

  // ── Source text, for the keyword a FUD0908 names and underlines (§4.2) ──

  #text(node: OxcNode): string {
    const at = this.#input.js.mapSpan(node.start, node.end);
    return this.#input.source.slice(at.start, at.end);
  }

  #firstWord(node: OxcNode): string {
    // Every statement that reaches here opens with its keyword: `return`, `throw`, `using`…
    return /^[A-Za-z_$][\w$]*(?:\s+using)?/u.exec(this.#text(node))![0];
  }

  /** The span of the statement's opening keyword, not of the whole statement. */
  #keyword(node: OxcNode, keyword: string): { readonly span: Span } {
    return { span: this.#input.js.mapSpan(node.start, node.start + keyword.length) };
  }
}
