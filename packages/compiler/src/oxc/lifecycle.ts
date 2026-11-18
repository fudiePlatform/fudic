/**
 * The lifecycle hooks of a `@code`, over the Oxc AST.
 *
 * Seven intrinsic functions, known by name like `props`: nobody imports them, so the compiler
 * can find every call, strip them from the server and check where they are written. Beside the
 * batch for the reason `pattern.ts` is: the emit rewrites the calls and the semantic pass judges
 * them, and neither may import the other.
 */

import type { Span } from '../types/index.js';
import type { OxcNode } from './batch.js';
import { walkPattern } from './pattern.js';

/** The seven hooks, in the order a life goes through them. */
export const HOOK_KINDS = [
  'beforeHydrate',
  'afterHydrate',
  'beforeCreate',
  'afterCreate',
  'onConnect',
  'onDisconnect',
  'onDispose',
] as const;

export type HookKind = (typeof HOOK_KINDS)[number];

/** The hooks of a component created in the browser: a route, a page or a layout never is. */
export const CREATE_HOOKS: ReadonlySet<HookKind> = new Set<HookKind>(['beforeCreate', 'afterCreate']);

const HOOKS: ReadonlySet<string> = new Set(HOOK_KINDS);

export const isHookKind = (name: string): name is HookKind => HOOKS.has(name);

/** Whether a top-level statement is, by itself, a call to a hook: what registers one. */
export function isHookStatement(stmt: OxcNode): boolean {
  const call = stmt['expression'] as OxcNode | undefined;
  const callee = call?.['callee'] as OxcNode | undefined;
  return call?.type === 'CallExpression' && callee?.type === 'Identifier' && isHookKind(String(callee['name']));
}

/** One call to a hook, in source coordinates. */
export interface HookUse {
  readonly kind: HookKind;
  /** The whole call, `afterHydrate(…)`. */
  readonly span: Span;
  /** The hook's name in the call. */
  readonly callee: Span;
  /** Whether the call is, by itself, a statement at the top level of the `@code`. */
  readonly topLevel: boolean;
}

/** A declaration or an import whose name is a hook's. */
export interface HookShadow {
  readonly name: HookKind;
  readonly span: Span;
}

export interface HookScan {
  readonly uses: readonly HookUse[];
  readonly shadows: readonly HookShadow[];
}

type MapSpan = (bufferStart: number, bufferEnd: number) => Span;

/** A statement list, or the single node of an expression fragment. */
type FragmentRoot = OxcNode | readonly OxcNode[];

function isNode(value: unknown): value is OxcNode {
  return typeof value === 'object' && value !== null && typeof (value as OxcNode).type === 'string';
}

const FUNCTIONS: ReadonlySet<string> = new Set([
  'ArrowFunctionExpression',
  'FunctionExpression',
  'FunctionDeclaration',
]);

const CLASSES: readonly string[] = ['ClassDeclaration', 'ClassExpression'];

const IMPORTS: ReadonlySet<string> = new Set([
  'ImportSpecifier',
  'ImportDefaultSpecifier',
  'ImportNamespaceSpecifier',
]);

/**
 * Every call to a hook and every name that hides one, in source order. `code` says whether
 * `roots` are the top-level statements of a `@code`, the one place a call registers; any other
 * JS — the view's — has no top level a hook may be called at.
 */
export function scanHooks(roots: FragmentRoot, mapSpan: MapSpan, code = true): HookScan {
  const uses: HookUse[] = [];
  const shadows: HookShadow[] = [];
  // A `@code` is always a statement list.
  const statements = code ? (roots as readonly OxcNode[]) : [];
  const topLevel = new Set<unknown>(
    statements.flatMap((s) => (s.type === 'ExpressionStatement' ? [s['expression']] : [])),
  );

  const shadow = (id: unknown): void => {
    if (isNode(id) && isHookKind(String(id['name']))) {
      shadows.push({ name: String(id['name']) as HookKind, span: mapSpan(id.start, id.end) });
    }
  };
  const bind = (pattern: unknown): void => walkPattern(pattern, { name: shadow, expression: visit });

  const call = (node: OxcNode): void => {
    const callee = node['callee'] as OxcNode;
    if (callee.type !== 'Identifier' || !isHookKind(String(callee['name']))) return;
    uses.push({
      kind: String(callee['name']) as HookKind,
      span: mapSpan(node.start, node.end),
      callee: mapSpan(callee.start, callee.end),
      topLevel: topLevel.has(node),
    });
  };

  // The nodes that call a hook or bind a name, and how the walk goes on from each. Any other
  // node binds nothing, and is descended whole.
  const special = new Map<string, (node: OxcNode) => void>([
    ['CallExpression', (node) => (call(node), descend(node))],
    ['VariableDeclarator', (node) => (bind(node['id']), visit(node['init']))],
    ['CatchClause', (node) => (bind(node['param']), visit(node['body']))],
    ...[...FUNCTIONS].map((type): [string, (node: OxcNode) => void] => [
      type,
      (node) => {
        shadow(node['id']);
        for (const param of node['params'] as readonly unknown[]) bind(param);
        visit(node['body']);
      },
    ]),
    ...CLASSES.map((type): [string, (node: OxcNode) => void] => [type, (node) => (shadow(node['id']), descend(node))]),
    ...[...IMPORTS].map((type): [string, (node: OxcNode) => void] => [type, (node) => shadow(node['local'])]),
  ]);

  function visit(node: unknown): void {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (isNode(node)) (special.get(node.type) ?? descend)(node);
  }

  function descend(node: OxcNode): void {
    for (const value of Object.values(node)) visit(value);
  }

  visit(roots);
  return {
    uses: uses.sort((a, b) => a.span.start - b.span.start),
    shadows: shadows.sort((a, b) => a.span.start - b.span.start),
  };
}
