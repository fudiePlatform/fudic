/**
 * Scope analysis over the Oxc AST (SDD-30 §3.3).
 *
 * A block takes as parameters everything its body CONSUMES and does not DECLARE, and the
 * difference between those two words is the whole of this module. Collecting `Identifier`
 * nodes would not do it: `obj.a` names no `a`, `{ a: 1 }` names no `a`, and a handler that
 * writes `(rows) => rows.length` declares its own `rows` rather than reading the prop of
 * that name. Each of those would put a parameter in the signature that shadows, or hides,
 * the value the block is supposed to receive.
 *
 * The analysis is deliberately allowed to be GENEROUS about what it calls free — §3.3 says
 * the list may pass of more and may never fall short — but never about what it calls bound:
 * a name wrongly reported as declared is a dependency that silently stops updating. So the
 * scopes below only ever open where the language really opens one, and only the positions
 * where an identifier is definitively not a reference are skipped.
 *
 * The same walk answers SDD-15 §4.7 — which identifiers of `@client` are the AUTHOR's, so
 * that a `$` prefix on one of them is `FUD0290`. There it may not be generous: a name
 * wrongly called the author's is an error reported on legal code. That is why the positions
 * where an identifier is definitively not one — a member, a class member, a label, the
 * exported name of an import — are skipped by NAME of the node that holds them, and not
 * left to the generic descent.
 *
 * Oxc hands back an untyped estree-shaped node; the stringly-typed access is quarantined
 * in `isNode` / `field` and never leaves this file.
 */

import type { OxcNode } from '../oxc/index.js';

/** A parsed fragment: one expression node, or the statement list of a region. */
export type FragmentAst = OxcNode | readonly OxcNode[];

// ── Typed access over the untyped Oxc node ──
function isNode(value: unknown): value is OxcNode {
  return typeof value === 'object' && value !== null && typeof (value as OxcNode).type === 'string';
}

/**
 * One field of a node, by name. Unguarded on purpose: every caller below has already
 * passed `isNode`, or reads a child of one — a check here would be a branch no input can
 * take, and a branch no input can take is a lie about the code.
 */
const field = (node: unknown, key: string): unknown => (node as Record<string, unknown>)[key];
const nameOf = (node: OxcNode): string => String(node['name']);

/** The three forms that open a function scope and bind their parameters. */
const FUNCTIONS: ReadonlySet<string> = new Set([
  'ArrowFunctionExpression',
  'FunctionExpression',
  'FunctionDeclaration',
]);

/**
 * The statements that open a lexical scope of their own. `for` and `for-of`/`for-in` are
 * here because the header of a loop declares INTO the loop, which is exactly the shape of
 * a `@foreach` header: `const { id } of rows` binds `id` for the body and nothing else.
 */
const SCOPES: ReadonlySet<string> = new Set([
  'BlockStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
]);

/** The names a scope holds, innermost last. */
class ScopeStack {
  readonly #frames: Set<string>[] = [new Set()];
  readonly #free: OxcNode[] = [];
  readonly #declared: OxcNode[] = [];
  readonly #seen = new Set<string>();

  /** Free references, deduplicated, in order of FIRST appearance (§3.3, determinism). */
  get free(): readonly string[] {
    return this.#free.map(nameOf);
  }

  /**
   * Every identifier the walk saw in a VALUE position: each declaration, and each free
   * reference once. The nodes, not the names — this is the half that carries the offsets a
   * diagnostic needs (SDD-15 §4.7).
   */
  get identifiers(): readonly OxcNode[] {
    return [...this.#declared, ...this.#free];
  }

  reference(node: OxcNode): void {
    const name = nameOf(node);
    if (this.#frames.some((frame) => frame.has(name))) return;
    if (this.#seen.has(name)) return;
    this.#seen.add(name);
    this.#free.push(node);
  }

  bind(node: OxcNode): void {
    this.#declared.push(node);
    this.#frames[this.#frames.length - 1]!.add(nameOf(node));
  }

  push(): void {
    this.#frames.push(new Set());
  }

  pop(): void {
    this.#frames.pop();
  }
}

/**
 * Bind everything a destructuring pattern declares, in the order the pattern writes it,
 * and walk the expressions hiding inside it.
 *
 * Those expressions are the reason this cannot be a name collector: a default
 * (`const { n = fallback } of rows`) and a computed key (`{ [k]: v }`) are ordinary
 * references to the scope OUTSIDE, and losing them would be a dependency falling short.
 */
function bindPattern(pattern: unknown, scope: ScopeStack, out: string[]): void {
  if (!isNode(pattern)) return;
  switch (pattern.type) {
    case 'Identifier':
      out.push(nameOf(pattern));
      scope.bind(pattern);
      return;
    case 'ObjectPattern':
      for (const property of asArray(field(pattern, 'properties'))) {
        if (isNode(property) && property.type === 'Property') {
          if (field(property, 'computed') === true) walk(field(property, 'key'), scope);
          bindPattern(field(property, 'value'), scope, out);
          continue;
        }
        bindPattern(property, scope, out);
      }
      return;
    case 'ArrayPattern':
      for (const element of asArray(field(pattern, 'elements'))) bindPattern(element, scope, out);
      return;
    case 'AssignmentPattern':
      bindPattern(field(pattern, 'left'), scope, out);
      walk(field(pattern, 'right'), scope);
      return;
    case 'RestElement':
      bindPattern(field(pattern, 'argument'), scope, out);
      return;
    default:
      // A TS-annotated parameter wraps the binding; everything else declares nothing.
      bindPattern(field(pattern, 'expression'), scope, out);
  }
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? (value as readonly unknown[]) : [];
}

/** A function of any of the three forms: its own scope, its parameters, its body. */
function walkFunction(node: OxcNode, scope: ScopeStack): void {
  scope.push();
  // The id goes INSIDE: a named function expression sees itself, and a declaration whose
  // name leaks outward would only ever be over-bound here, never under-bound.
  const id = field(node, 'id');
  if (isNode(id)) scope.bind(id);
  for (const param of asArray(field(node, 'params'))) bindPattern(param, scope, []);
  walk(field(node, 'body'), scope);
  scope.pop();
}

/** `let x = init` — the init is read in the scope the declaration is written in. */
function walkDeclaration(node: OxcNode, scope: ScopeStack): void {
  for (const declarator of asArray(field(node, 'declarations'))) {
    walk(field(declarator, 'init'), scope);
    bindPattern(field(declarator, 'id'), scope, []);
  }
}

/**
 * The walk. Everything not named below descends generically over its fields, which is what
 * keeps this honest for the JS nobody anticipated: an unknown node cannot hide a reference,
 * it can only report one that a narrower rule would have skipped.
 */
function walk(node: unknown, scope: ScopeStack): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, scope);
    return;
  }
  if (!isNode(node)) return;

  // A type is not a value. `x as Foo` references `x` and nothing called `Foo`, so the
  // TS wrappers descend into their expression and their annotations are dropped whole.
  if (node.type.startsWith('TS')) {
    walk(field(node, 'expression'), scope);
    return;
  }

  switch (node.type) {
    case 'Identifier':
      scope.reference(node);
      return;
    case 'MemberExpression':
      walk(field(node, 'object'), scope);
      if (field(node, 'computed') === true) walk(field(node, 'property'), scope);
      return;
    // A member of an object or of a class is a NAME, not a binding: `{ a: 1 }` and
    // `class C { a() {} }` both mention an `a` that no scope holds. They are grouped here
    // because they are spelt the same way — a `key` guarded by `computed`, and a value that
    // is ordinary code.
    case 'Property':
    case 'PropertyDefinition':
    case 'MethodDefinition':
      if (field(node, 'computed') === true) walk(field(node, 'key'), scope);
      walk(field(node, 'value'), scope);
      return;
    // A label lives in its own namespace: `outer:` declares nothing a scope can hold and
    // `break outer` reads no variable. Descending generically would report both as free.
    case 'LabeledStatement':
      walk(field(node, 'body'), scope);
      return;
    case 'BreakStatement':
    case 'ContinueStatement':
      return;
    // `import { a as b }` binds `b`; `a` is the OTHER module's export name, and this file
    // neither declares nor resolves it.
    case 'ImportSpecifier':
      walk(field(node, 'local'), scope);
      return;
    case 'VariableDeclaration':
      walkDeclaration(node, scope);
      return;
    default:
      break;
  }

  if (FUNCTIONS.has(node.type)) {
    walkFunction(node, scope);
    return;
  }
  if (SCOPES.has(node.type)) {
    scope.push();
    descend(node, scope);
    scope.pop();
    return;
  }
  descend(node, scope);
}

/** Every child of a node, whatever it is called. */
function descend(node: OxcNode, scope: ScopeStack): void {
  for (const value of Object.values(node)) walk(value, scope);
}

/**
 * The free references of a set of fragments, deduplicated and in order of first appearance.
 *
 * The fragments are handed in the order the emit reads them (source order), so the same
 * template always yields the same list — the determinism invariant of §5, and what makes
 * a block's signature stable across recompiles.
 */
export function freeReferences(fragments: readonly FragmentAst[]): readonly string[] {
  const scope = new ScopeStack();
  for (const fragment of fragments) walk(fragment, scope);
  return scope.free;
}

/**
 * The identifiers of `statements` that trespass on the compiler's `$` namespace, in source
 * order (SDD-15 §4.7).
 *
 * It rides the SAME walk as `freeReferences` on purpose. The two questions are one question
 * asked twice: which identifiers of this region are the author's, as opposed to a property
 * name, a class member or a key. A second traversal with its own idea of that would drift,
 * and the drift is silent both ways — a `$` declaration nobody reports collides at run time,
 * and an `obj.$bar` wrongly reported is an error on legal code.
 *
 * Which occurrence is reported follows from the rule: a DECLARATION is flagged where it is
 * written, and a free reference at its first use. A reference to a `$` name the region
 * itself declared is not reported again — the declaration already is, and the second
 * diagnostic would only say the author meant it.
 */
export function reservedIdentifiers(statements: readonly OxcNode[]): readonly OxcNode[] {
  const scope = new ScopeStack();
  for (const statement of statements) walk(statement, scope);
  return scope.identifiers
    .filter((node) => nameOf(node).startsWith('$'))
    .sort((a, b) => a.start - b.start);
}

/**
 * The names a binding pattern declares, in the order the pattern writes them.
 *
 * That order is the parameter order of a block (§3.3): `{ id, name }` yields `id` then
 * `name` and never the other way round, because a signature that reshuffles between two
 * compilations of the same file is not a signature.
 */
export function patternBindings(pattern: unknown): readonly string[] {
  const out: string[] = [];
  bindPattern(pattern, new ScopeStack(), out);
  return out;
}

/**
 * The top-level names of a region whose VALUE can change (§3.3).
 *
 * These are the only ones a block needs as a parameter: `u` has nothing new to hand a
 * binding that cannot move, and a `const` the author never reassigns reaches the block
 * through the closure for free. What decides it is the AST — the declaration kind, and
 * whether any assignment anywhere in the region targets the name — not the spelling.
 */
export function changeableBindings(statements: readonly OxcNode[]): ReadonlySet<string> {
  const assigned = new Set<string>();
  collectAssigned(statements, assigned);

  const out = new Set<string>();
  for (const statement of statements) {
    if (statement.type !== 'VariableDeclaration') continue;
    const rebindable = field(statement, 'kind') !== 'const';
    for (const declarator of asArray(field(statement, 'declarations'))) {
      for (const name of patternBindings(field(declarator, 'id'))) {
        if (rebindable || assigned.has(name)) out.add(name);
      }
    }
  }
  return out;
}

/** Every name that is the target of an assignment or of `++`/`--`, however deep. */
function collectAssigned(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) collectAssigned(child, out);
    return;
  }
  if (!isNode(node)) return;
  if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression') {
    const target = field(node, node.type === 'UpdateExpression' ? 'argument' : 'left');
    if (isNode(target) && target.type === 'Identifier') out.add(nameOf(target));
  }
  for (const value of Object.values(node)) collectAssigned(value, out);
}
