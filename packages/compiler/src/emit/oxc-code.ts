/**
 * `@code` extraction for the SSR emit: read the component's `props<T>()` object pattern
 * and its `signal(init)` declarations out of the JS parsed by Oxc (SDD-11).
 *
 * Oxc hands back an untyped estree-shaped node whose children are reached by property
 * name. That stringly-typed access is quarantined here behind `field` / `fieldArray`
 * and the `is()` discriminant check, so the traversal below reads as plain typed code
 * and the rest of the emit never touches an `OxcNode` index. Offsets come back in the
 * synthetic batch buffer and are mapped to the original source via `mapOffset`.
 */

import type { ComponentDocument } from '../document/index.js';
import { JsBatch, type OxcNode } from '../oxc/index.js';

/** One destructured prop from `props<T>()`, with its default expression source if any. */
export interface Prop {
  readonly name: string;
  readonly def?: string;
}

/** One `const x = signal(init)` declaration; `init` is the initial-value source. */
export interface Signal {
  readonly name: string;
  readonly init: string;
}

export interface ExtractedCode {
  readonly props: Prop[];
  readonly signals: Signal[];
}

// ── Typed access over the untyped Oxc node (the only place that indexes by name) ──
const is = (node: OxcNode | undefined, type: string): boolean => node?.type === type;
const field = (node: OxcNode, key: string): OxcNode | undefined => node[key] as OxcNode | undefined;
const fieldArray = (node: OxcNode, key: string): OxcNode[] => (node[key] as OxcNode[] | undefined) ?? [];
const name = (node: OxcNode): string => String(node['name']);

type MapOffset = (bufferOffset: number) => number;

/** Extract `props<T>()` defaults and inert `signal()` initials from a component's `@code`. */
export function extractCode(source: string, doc: ComponentDocument): ExtractedCode {
  const props: Prop[] = [];
  const signals: Signal[] = [];
  if (!doc.code) return { props, signals };

  const batch = new JsBatch(source);
  const ids = doc.code.parts.map((p) => batch.add('module-statements', p.js));
  const result = batch.parse();
  const map = result.value.mapOffset;

  for (const id of ids) {
    const root = result.value.ast(id);
    const stmts = Array.isArray(root) ? (root as OxcNode[]) : [root as OxcNode];
    for (const stmt of stmts) {
      if (!is(stmt, 'VariableDeclaration')) continue;
      for (const decl of fieldArray(stmt, 'declarations')) {
        readDeclarator(decl, source, map, props, signals);
      }
    }
  }
  return { props, signals };
}

/** Route a single `const … = call(...)` declarator to props (ObjectPattern) or signals. */
function readDeclarator(
  decl: OxcNode,
  source: string,
  map: MapOffset,
  props: Prop[],
  signals: Signal[],
): void {
  const init = field(decl, 'init');
  const id = field(decl, 'id');
  if (!init || !id || !is(init, 'CallExpression')) return;
  const callee = field(init, 'callee');
  const called = is(callee, 'Identifier') ? name(callee!) : '';

  if (called === 'props' && is(id, 'ObjectPattern')) {
    for (const property of fieldArray(id, 'properties')) readProp(property, source, map, props);
  } else if (called === 'signal' && is(id, 'Identifier')) {
    const arg = fieldArray(init, 'arguments')[0];
    signals.push({ name: name(id), init: arg ? source.slice(map(arg.start), map(arg.end)) : 'undefined' });
  }
}

/** Flatten one `{ a, b = expr }` property, taking the default's source verbatim. */
function readProp(property: OxcNode, source: string, map: MapOffset, out: Prop[]): void {
  const key = field(property, 'key');
  if (!is(property, 'Property') || !is(key, 'Identifier')) return;
  const value = field(property, 'value');
  if (value && is(value, 'AssignmentPattern')) {
    const right = field(value, 'right')!;
    out.push({ name: name(key!), def: source.slice(map(right.start), map(right.end)) });
  } else {
    out.push({ name: name(key!) });
  }
}
