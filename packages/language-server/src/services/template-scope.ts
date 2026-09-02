/**
 * Every name the template of a `.fud` may use, and what kind of thing each one is.
 *
 * This is the server's OWN knowledge, and the distinction matters more than it looks. The
 * names come from the statements Oxc already parsed out of `@code` and `@client` — no
 * TypeScript program, no `.d.ts`, no projection is involved in computing them. The file
 * parses, so the list exists.
 *
 * It used to be a FILTER and nothing else: TypeScript answered with its whole scope at the
 * offset and this set decided which of those names survived. A filter can only subtract, so
 * the moment TypeScript answered with NOTHING — a program that had not finished loading, a
 * stale `.d.ts`, a virtual file the project never included — the developer saw an empty list
 * while the server was holding the answer. That is what the editor kept showing, and no
 * amount of correctness in the projection could have fixed it.
 *
 * So the same set is now also a SOURCE: the callers offer these names themselves and merge
 * whatever TypeScript has to say on top, preferring TypeScript's item when both have one —
 * it carries the type, the documentation and the auto-import machinery, and ours carries a
 * name. What the developer sees no longer depends on the TypeScript program being alive.
 *
 * `@server` is deliberately absent: its names live in a module of their own and the template
 * cannot reach them. Offering one would be offering an error.
 */

import type { FragmentId, OxcNode } from '@fudic/compiler';
import type { CachedDocument } from '../document-cache.js';

/**
 * What a name in scope can be used AS.
 *
 * Only the distinction the grammar needs: after `@click=` a listener is the only thing that
 * fits, so a `const` holding a number is not a candidate however legitimately it is in scope.
 * Everything that is not visibly a function is a value — a name whose type only TypeScript
 * knows is not guessed at here.
 */
export type ScopeKind = 'function' | 'value';

/** The names the template sees, each with its kind. */
export type TemplateScope = ReadonlyMap<string, ScopeKind>;

/**
 * Every name the template of this file may use.
 *
 * Three sources, and they are the three the projection puts in scope. The neutral chunks of
 * `@code` hold the `props<T>()` destructuring, so a component's own props come from there. The
 * `@client` regions hold the reactives and the handlers. And `data` is declared by the
 * projection itself — for a route or a page, never for a component, which receives props and
 * has no route data to read (SDD-23 §4.2).
 */
export function templateScope(cached: CachedDocument, offset?: number): TemplateScope {
  if (!interpolates(cached)) return new Map();

  const names = declaredNames(cached, [...cached.js.neutral, ...cached.js.client]);
  if (cached.document.type !== 'component-document') names.set('data', 'value');
  if (offset !== undefined) addLoopBindings(cached, offset, names);
  return names;
}

/**
 * The names the loops AROUND `offset` declare, added to the file's own.
 *
 * The correction of BUG-23 §2.9, and the reason it is here rather than a filter over
 * TypeScript's reply: the same rule the rest of this module lives by. What the developer sees
 * cannot depend on the TypeScript program being alive — a program still loading, a `tsconfig`
 * that does not reach the file, a virtual the project never included — because the file being
 * typed into is exactly the one where that goes wrong. The names come from the parse, so they
 * exist whenever the file parses.
 *
 * NESTING needs no rule of its own. Every loop whose construct contains the offset contributes,
 * so two `@foreach` one inside the other contribute both, in source order — the inner one last,
 * which is what shadowing means when the same name is declared twice. Depth is not a number this
 * function knows.
 *
 * `headerEnd` is what keeps a binding from being read before it exists: inside `(const x of xs)`
 * the `x` is being declared, not used, so the scope there is still the one outside. Past it the
 * `key (…)` and the whole body see it (decision 91).
 */
function addLoopBindings(
  cached: CachedDocument,
  offset: number,
  into: Map<string, ScopeKind>,
): void {
  for (const loop of cached.js.loops) {
    if (offset < loop.headerEnd || offset > loop.span.end) continue;
    // A loop variable is a value: nothing about `const x of xs` says `x` can be called, and
    // guessing from an initializer that is not there would be inventing an answer.
    for (const name of loopBindingNames(loop.statement)) into.set(name, 'value');
  }
}

/**
 * The names a loop header declares, in source order.
 *
 * Shared with the quick fix that writes a missing `key (…)` (SDD-36 §4.3), because they are the
 * same question: the scope wants all of them, the key wants the first. Two readings of one
 * header is how the editor and the build came to disagree in BUG-23, and this is the same shape
 * of mistake one size smaller.
 *
 * Empty for everything that declares nothing: a header Oxc could not read, a `for (;;)` with no
 * initializer, and `for (x of xs)` — whose left-hand side is an assignment to a name that
 * already exists, not a declaration of a new one.
 */
export function loopBindingNames(statement: OxcNode | undefined): readonly string[] {
  if (statement === undefined) return [];

  // `for (const x of xs)` keeps its declaration in `left`; `for (let i = 0; …)` in `init`.
  const declaration = (statement['left'] ?? statement['init']) as OxcNode | null | undefined;
  if (declaration === null || declaration === undefined) return [];
  if (declaration.type !== 'VariableDeclaration') return [];

  const names = new Map<string, ScopeKind>();
  for (const declarator of declaration['declarations'] as readonly OxcNode[]) {
    collectPatternNames(declarator['id'] as OxcNode, 'value', names);
  }
  return [...names.keys()];
}

/**
 * Whether the template of this file may interpolate at all — and a LAYOUT may not.
 *
 * A layout owns the shell and nothing else: it has no `@code` (`FUD0437`), so it declares no
 * name; it does not `load` (`FUD0430`), so there is no `data` to read. What a `@` opens there
 * is one of the three `@Render*` directives and nothing else — not a name, not `@()`, not a
 * construct. Offering any of those is offering a file that is red the moment it lands.
 */
export function interpolates(cached: CachedDocument): boolean {
  return cached.document.type !== 'layout-document';
}

/**
 * The names of a scope that may be written at this position.
 *
 * The one narrowing of the grammar: after an event's `=` only something callable fits.
 */
export function scopeNames(scope: TemplateScope, callableOnly: boolean): readonly string[] {
  const names: string[] = [];
  for (const [name, kind] of scope) {
    if (callableOnly && kind !== 'function') continue;
    names.push(name);
  }
  return names;
}

/**
 * The top-level names declared by a set of fragments of this document.
 *
 * Declarations only, and by walking the statements Oxc already parsed rather than the text:
 * `function onClick(){}` and `const onClick = () => {}` are the same contract to a template,
 * and neither is findable with a regular expression that a comment cannot fool.
 *
 * A name declared inside a nested scope is deliberately absent — it is not reachable from the
 * template either, so offering it would be offering an error.
 */
function declaredNames(
  cached: CachedDocument,
  fragments: readonly FragmentId[],
): Map<string, ScopeKind> {
  const names = new Map<string, ScopeKind>();

  for (const id of fragments) {
    // A `module-statements` fragment always answers with the list of its top-level statements
    // — an empty one when Oxc could not parse it — so there is no absent AST to guard against
    // (SDD-11 §4.1).
    const statements = cached.js.result.ast(id) as readonly OxcNode[];

    for (const statement of statements) {
      collectDeclaredNames(statement, names);
    }
  }
  return names;
}

/** The names one top-level statement introduces. */
function collectDeclaredNames(statement: OxcNode, into: Map<string, ScopeKind>): void {
  if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') {
    // A class is callable with `new` and never as a listener, so only a function is one. The
    // name is always an `Identifier` here: the anonymous forms are `export default function
    // () {}` and its class twin, and those arrive wrapped in an `ExportDefaultDeclaration`,
    // which is not this statement type at all.
    const id = statement['id'] as OxcNode;
    into.set(String(id['name']), statement.type === 'FunctionDeclaration' ? 'function' : 'value');
    return;
  }
  if (statement.type !== 'VariableDeclaration') return;

  for (const declarator of statement['declarations'] as readonly OxcNode[]) {
    const id = declarator['id'] as OxcNode;
    // `const onClick = () => {}` is a handler as much as a `function` is, and it is how a
    // component pulls one out of a module. Only a lone identifier can carry the kind: in
    // `const { a, b } = f()` there is no initializer per name to read it from.
    const kind = id.type === 'Identifier' && isFunctionExpression(declarator['init']) ? 'function' : 'value';
    collectPatternNames(id, kind, into);
  }
}

/** Whether an initializer is visibly a function. Nothing is inferred: only the two shapes. */
function isFunctionExpression(init: unknown): boolean {
  const node = init as OxcNode | null | undefined;
  return node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression';
}

/**
 * Every binding a declarator's pattern introduces.
 *
 * `const { a, b: c } = x` declares `a` and `c`, and `const [first] = xs` declares `first`.
 * Walking the pattern is what keeps a destructured handler — which is how a component pulls
 * one out of a module — from being filtered out of its own list.
 */
function collectPatternNames(pattern: OxcNode, kind: ScopeKind, into: Map<string, ScopeKind>): void {
  switch (pattern.type) {
    case 'Identifier':
      into.set(String(pattern['name']), kind);
      return;
    case 'ObjectPattern':
      // `value` for a property and `argument` for the rest element: the two shapes a member
      // of an object pattern comes in, and every one of them has one or the other.
      for (const property of pattern['properties'] as readonly OxcNode[]) {
        collectPatternNames((property['value'] ?? property['argument']) as OxcNode, kind, into);
      }
      return;
    case 'ArrayPattern':
      // A hole — `const [, second] = xs` — is a null element and binds nothing.
      for (const element of pattern['elements'] as readonly (OxcNode | null)[]) {
        if (element !== null) collectPatternNames(element, kind, into);
      }
      return;
    case 'AssignmentPattern':
      collectPatternNames(pattern['left'] as OxcNode, kind, into);
      return;
    case 'RestElement':
      collectPatternNames(pattern['argument'] as OxcNode, kind, into);
      return;
  }
}
