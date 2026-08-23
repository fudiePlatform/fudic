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
export function templateScope(cached: CachedDocument): TemplateScope {
  const names = declaredNames(cached, [...cached.js.neutral, ...cached.js.client]);
  if (cached.document.type !== 'component-document') names.set('data', 'value');
  return names;
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
