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
   * Whether the child declares it REACTIVE. Nobody sets it to `true` today: the shared-cell
   * mechanism (SDD-31 §7) is its own SDD, and this BUG only leaves the signature with the
   * right shape.
   */
  readonly reactive: boolean;
}

/**
 * HOW a value crosses the shadow boundary. Two forms, and only one is emitted today:
 *
 *  - `'value'` — the READ, `titulo()`. Decision 84 as it is implemented. The reason it is
 *    the value and not the object is hard: the server would paint `[object Object]`, and the
 *    client would hand the child a live `Set` that `fud-state` cannot serialize (SDD-17 §3).
 *  - `'ref'`   — the shared cell, with which parent and child hold the SAME object
 *    (SDD-31 §7). Decided, not implemented: no emitter produces it yet.
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
 * the parent alone. Absent — or declaring a prop that is not reactive — the answer is always
 * `'value'`, so the emitted output does not move a byte.
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
  if (!reactives.has(name)) return undefined;
  return { kind: target?.reactive === true ? 'ref' : 'value', name };
}
