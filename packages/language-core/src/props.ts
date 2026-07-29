/**
 * Projection of `props<T>()` into the component's public contract (SDD-23 §3.2, §4.4).
 *
 * The user writes one declaration:
 *
 *     const { tone = 'neutral' } = props<{ tone?: Tone }>();
 *
 * and the virtual file turns it into three lines:
 *
 *     const $p0 = props<{ tone?: Tone }>();
 *     export type $Props = typeof $p0;
 *     const { tone = 'neutral' } = $p0;
 *
 * The split is what gives every OTHER file a name to import: `$Props` is the type a parent
 * checks its attributes against. Both halves the user wrote — the call with its type
 * argument, and the pattern with its defaults — are copied verbatim, so hover and rename
 * land on their own text; only the `$p0` around them is scaffolding.
 *
 * Finding the declaration needs the JS AST, not a regular expression: `props` can appear
 * in a comment, a string, or a nested scope. Oxc already parsed the fragment (SDD-11), so
 * this module walks nodes and never looks at text.
 */

import type { OxcNode, Span } from '@fudic/compiler';
import type { VirtualWriter } from './writer.js';

/** The three source spans of a `props<T>()` declaration, in original coordinates. */
export interface PropsCall {
  /** The whole `const … = props<T>();` statement — the stretch the client virtual replaces. */
  readonly declaration: Span;
  /** The binding the user destructured into: `{ tone = 'neutral' }`, or a plain name. */
  readonly pattern: Span;
  /** The call itself, `props<T>()`, with its type argument. */
  readonly call: Span;
}

/** Map a pair of Oxc buffer offsets back to original-source coordinates (SDD-11 §4.4). */
export type MapSpan = (bufferStart: number, bufferEnd: number) => Span;

/**
 * Locate the `props<T>()` declaration among a fragment's top-level statements.
 *
 * Only top level, and only the first one: a component has a single props contract
 * (decision 54 gives it a single `@code`), and a `props()` call nested inside a function
 * is not a contract — projecting it would export a type the component does not have.
 */
export function findPropsCall(
  statements: readonly OxcNode[],
  mapSpan: MapSpan,
): PropsCall | undefined {
  for (const statement of statements) {
    if (statement.type !== 'VariableDeclaration') continue;

    for (const declarator of nodeList(statement, 'declarations')) {
      const init = child(declarator, 'init');
      const id = child(declarator, 'id');
      if (init === undefined || id === undefined || !isPropsCall(init)) continue;

      return {
        declaration: mapSpan(statement.start, statement.end),
        pattern: mapSpan(id.start, id.end),
        call: mapSpan(init.start, init.end),
      };
    }
  }
  return undefined;
}

/**
 * Write the props contract into a virtual file.
 *
 * With no `props<T>()`, `$Props` is `never` (§3.2) rather than absent: a parent that passes
 * attributes to a component taking none must fail on the attributes, and `never` is what
 * makes the checker say so. An absent export would fail on the import instead — an error
 * about scaffolding, in the wrong file.
 */
export function emitPropsProjection(w: VirtualWriter, props: PropsCall | undefined): void {
  if (props === undefined) {
    w.scaffold('export type $Props = never;\n');
    return;
  }

  w.scaffold('const $p0 = ', props.declaration);
  w.copy(props.call);
  w.scaffold(';\nexport type $Props = typeof $p0;\nconst ');
  w.copy(props.pattern);
  w.scaffold(' = $p0;\n');
}

/** `props(...)` or `props<T>(...)` — a direct call of the ambient `props`. */
function isPropsCall(init: OxcNode): boolean {
  if (init.type !== 'CallExpression') return false;
  const callee = child(init, 'callee');
  return callee?.type === 'Identifier' && callee['name'] === 'props';
}

/** A child node under `key`, when it is a node at all. */
function child(parent: OxcNode, key: string): OxcNode | undefined {
  const value = parent[key];
  return isNode(value) ? value : undefined;
}

/** The node array under `key`, skipping holes (`[, x]` yields a null element). */
function nodeList(parent: OxcNode, key: string): readonly OxcNode[] {
  const value = parent[key];
  return Array.isArray(value) ? value.filter(isNode) : [];
}

function isNode(value: unknown): value is OxcNode {
  return typeof value === 'object' && value !== null && typeof (value as OxcNode).type === 'string';
}
