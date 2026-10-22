/**
 * The server cut of a `@code` without regions (SDD-60 §4.8).
 *
 * The `@code` is browser code, all of it. To paint, the SSR and the Service Worker evaluate
 * only what the markup reads — transitively, through every initializer and function body it
 * reaches, imports included — plus the top-level `provide` calls. Nothing else of the `@code`
 * runs outside the browser, and an `effect` never does.
 *
 * What a deferred binding names (`@click=@(save)`, `bus:`, `ref=`) is not read while painting:
 * it is called later, in the browser. A bare function name handed to a prop crosses as a cell
 * and is stubbed on the server, as it always was, so it does not pull its function in either.
 */

import type { HtmlContent } from '../html/index.js';
import type { OxcNode } from '../oxc/index.js';
import { walkElements } from './level.js';
import { freeReferences, topLevelBindings } from './scope.js';

export interface CutInput {
  /** Every top-level statement of the `@code`, in source order. */
  readonly statements: readonly OxcNode[];
  /** The ASTs of the template fragments the server paints with. */
  readonly seeds: readonly (OxcNode | readonly OxcNode[])[];
  /** Whether a statement is always in the cut: a top-level `provide(…)`, the `props<T>()` the emit writes on both sides. */
  readonly always: (stmt: OxcNode) => boolean;
  /** Whether a statement calls `effect(…)` at its top level. */
  readonly effects: (stmt: OxcNode) => boolean;
}

/** TypeScript declarations: erased, so always in the cut, and never a reason to pull anything. */
const TYPES: ReadonlySet<string> = new Set(['TSTypeAliasDeclaration', 'TSInterfaceDeclaration', 'TSEnumDeclaration', 'TSModuleDeclaration']);

/** The names a top-level statement binds, imports included. */
function bound(stmt: OxcNode): readonly string[] {
  if (stmt.type === 'ImportDeclaration') {
    return (stmt['specifiers'] as readonly OxcNode[]).map((s) => String((s['local'] as OxcNode)['name']));
  }
  const inner = stmt.type === 'ExportNamedDeclaration' ? (stmt['declaration'] as OxcNode | null) : stmt;
  if (inner === null) return [];
  if (inner.type === 'ClassDeclaration') return [String((inner['id'] as OxcNode)['name'])];
  return topLevelBindings([inner]);
}

/** The statements of the cut. */
export function serverCut(input: CutInput): ReadonlySet<OxcNode> {
  const byName = new Map<string, OxcNode>();
  for (const stmt of input.statements) for (const name of bound(stmt)) byName.set(name, stmt);

  const cut = new Set<OxcNode>();
  const pending: string[] = [];
  const take = (stmt: OxcNode): void => {
    if (cut.has(stmt) || input.effects(stmt)) return;
    cut.add(stmt);
    // An import brings a binding and reads nothing of the file.
    if (stmt.type !== 'ImportDeclaration') pending.push(...freeReferences([stmt]));
  };

  for (const stmt of input.statements) {
    if (TYPES.has(stmt.type) || input.always(stmt)) take(stmt);
  }
  pending.push(...freeReferences(input.seeds));
  while (pending.length > 0) {
    const stmt = byName.get(pending.pop()!);
    if (stmt !== undefined) take(stmt);
  }
  return cut;
}

/**
 * The `start,end` of every template fragment that is not read while painting: the value of an
 * `@event`, of a `bus:` binding and of `ref=`. `bus:( … )` names its event with an expression,
 * and that one is painted.
 */
export function deferredSpans(roots: readonly HtmlContent[]): ReadonlySet<string> {
  const out = new Set<string>();
  walkElements(roots, (el) => {
    for (const attr of el.attributes) {
      const name = attr.name;
      const deferred = typeof name !== 'string' || name.startsWith('@') || name.startsWith('bus:') || name === 'ref';
      if (!deferred) continue;
      for (const part of attr.value) {
        if (part.type === 'razor-expression') out.add(`${part.expr.start},${part.expr.end}`);
      }
    }
  });
  return out;
}
