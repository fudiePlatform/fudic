/**
 * HOW a value crosses the shadow boundary (grammar decision 84).
 *
 * The rule used to live inside `emit/attrs.ts` as `reactiveName`, where nobody but the emit
 * could reach it — and the consequence was BUG-23 §2.8: the compiler crossed `titulo()`, the
 * string, while the editor type-checked `titulo`, the `Signal<string>`. Two readers looking
 * at two different expressions of the same line. One definition fixes it, and it has to live
 * outside the emit for the projection to be able to import it.
 */

import type { OxcNode } from '../oxc/index.js';
import type { AttributeValuePart } from '../html/index.js';

/** The two calls that declare a reactive name (SDD-31 §4.7). */
const REACTIVE_CALLS: ReadonlySet<string> = new Set(['signal', 'computed']);

/**
 * The names a list of statements declares with `signal(...)` or `computed(...)`.
 *
 * By the CALLEE and never by the import: what makes a name reactive is what it was
 * initialised with, so a `signal` declared inside `@client` counts exactly as much as one
 * imported from `@fudic/core`.
 */
export function reactiveNames(statements: readonly OxcNode[]): ReadonlySet<string> {
  const names = new Set<string>();
  for (const stmt of statements) {
    if (stmt.type !== 'VariableDeclaration') continue;
    for (const decl of stmt['declarations'] as readonly OxcNode[]) {
      const id = decl['id'] as OxcNode | undefined;
      const init = decl['init'] as OxcNode | undefined;
      if (id?.type !== 'Identifier' || init?.type !== 'CallExpression') continue;
      const callee = init['callee'] as OxcNode | undefined;
      if (callee?.type !== 'Identifier') continue;
      if (REACTIVE_CALLS.has(String(callee['name']))) names.add(String(id['name']));
    }
  }
  return names;
}

/**
 * What the CHILD declares about one prop.
 *
 * It lives here and not in `semantic/model.ts` — which re-exports it — because a rule the
 * emit and the semantic pass both read cannot live inside either of them.
 */
export interface ComponentDeclaredProps {
  readonly name: string;
  readonly required: boolean;
  /**
   * What the child asks to be handed by REFERENCE (props-spec decision 86): `'signal'` for a
   * `Signal<T>`, `'fn'` for a function signature, absent for a plain value.
   *
   * Absent is also what a child nobody could READ declares, and the two are deliberately the
   * same answer: with no `T` to read there is nothing to prove, and everything keeps crossing
   * by value exactly as decision 84 left it.
   */
  readonly channel?: 'signal' | 'fn';
}

/**
 * HOW a value crosses the shadow boundary. Two forms, and what decides between them is what
 * the CHILD declares (props-spec decision 86):
 *
 *  - `'value'` — the READ, `titulo()`. Decision 84, and still the default: a child that
 *    declares `titulo?: string` gets the string, because that is what it asked for.
 *  - `'ref'`   — the shared cell, with which parent and child hold the SAME object. A child
 *    that declares `Signal<T>` can derive from it, forward it to a grandchild and write it;
 *    one that declares a function signature gets the owner's function itself (BUG-24 §4.6).
 */
export type Crossing =
  | { readonly kind: 'value'; readonly name: string }
  | { readonly kind: 'ref'; readonly name: string };

/**
 * Which reactive a value crosses with and in what form, or `undefined` when it crosses none.
 *
 * The rule is deliberately narrow: the whole value must be ONE `@expr` whose text is the bare
 * name of something in `reactives`. `@count` is reactive; `@(count() + 1)` is a value that
 * happens to read one, and the difference is what decides whether anything downstream can
 * ever move.
 *
 * `target` is what the CHILD declares, because the form of the crossing stopped depending on
 * the parent alone. Absent — or declaring a prop with no channel — the answer is always
 * `'value'`, so the emitted output does not move a byte.
 *
 * The two questions are asked in that order, and the order is the rule. A child that declares
 * a channel gets the OBJECT whatever the parent named, because `reactives` is a fact about
 * the parent and the child's contract does not depend on it — a callback is not a `signal(…)`
 * and would fall out of that set, and so would a name the parent got as a prop and is only
 * forwarding. What is not a bare name never crosses by reference: `.value=@42` against a
 * `Signal<number>` is a mistake, and FUD0200 is where it is reported, not here.
 */
export function crossing(
  source: string,
  value: readonly AttributeValuePart[],
  reactives: ReadonlySet<string>,
  target?: ComponentDeclaredProps,
): Crossing | undefined {
  const only = value.length === 1 ? value[0] : undefined;
  if (only?.type !== 'razor-expression') return undefined;
  const name = source.slice(only.expr.start, only.expr.end);
  if (target?.channel !== undefined) return isBareName(name) ? { kind: 'ref', name } : undefined;
  if (!reactives.has(name)) return undefined;
  return { kind: 'value', name };
}

/**
 * Whether the whole expression is ONE identifier — the only shape a reference can cross as.
 *
 * By the characters and not by the AST, because `crossing` is the rule the emit, the build's
 * semantic pass and the editor's projection all apply, and only the first of the three holds
 * a parsed fragment for an attribute value. What it has to separate is `@count` from
 * `@(count() + 1)`, and an identifier is exactly what neither a call nor an operator is.
 */
const BARE_NAME = /^[$_\p{ID_Start}][$\p{ID_Continue}]*$/u;

const isBareName = (text: string): boolean => BARE_NAME.test(text);
