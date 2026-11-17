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

function isNode(value: unknown): value is OxcNode {
  return typeof value === 'object' && value !== null && typeof (value as OxcNode).type === 'string';
}

const FUNCTIONS: ReadonlySet<string> = new Set([
  'ArrowFunctionExpression',
  'FunctionExpression',
  'FunctionDeclaration',
]);

const IMPORTS: ReadonlySet<string> = new Set([
  'ImportSpecifier',
  'ImportDefaultSpecifier',
  'ImportNamespaceSpecifier',
]);

/**
 * Every call to a hook and every name that hides one, in source order, for the top-level
 * statements of a `@code`.
 */
export function scanHooks(statements: readonly OxcNode[], mapSpan: MapSpan): HookScan {
  const uses: HookUse[] = [];
  const shadows: HookShadow[] = [];
  const topLevel = new Set<unknown>(
    statements.flatMap((s) => (s.type === 'ExpressionStatement' ? [s['expression']] : [])),
  );

  const shadow = (id: unknown): void => {
    if (isNode(id) && isHookKind(String(id['name']))) {
      shadows.push({ name: String(id['name']) as HookKind, span: mapSpan(id.start, id.end) });
    }
  };
  const bind = (pattern: unknown): void => walkPattern(pattern, { name: shadow, expression: visit });

  function visit(node: unknown): void {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (!isNode(node)) return;
    if (node.type === 'CallExpression') {
      const callee = node['callee'];
      if (isNode(callee) && callee.type === 'Identifier' && isHookKind(String(callee['name']))) {
        uses.push({
          kind: String(callee['name']) as HookKind,
          span: mapSpan(node.start, node.end),
          callee: mapSpan(callee.start, callee.end),
          topLevel: topLevel.has(node),
        });
      }
    } else if (node.type === 'VariableDeclarator') {
      bind(node['id']);
      visit(node['init']);
      return;
    } else if (FUNCTIONS.has(node.type)) {
      shadow(node['id']);
      for (const param of node['params'] as readonly unknown[]) bind(param);
      visit(node['body']);
      return;
    } else if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      shadow(node['id']);
    } else if (node.type === 'CatchClause') {
      bind(node['param']);
      visit(node['body']);
      return;
    } else if (IMPORTS.has(node.type)) {
      shadow(node['local']);
      return;
    }
    for (const value of Object.values(node)) visit(value);
  }

  visit(statements);
  return {
    uses: uses.sort((a, b) => a.span.start - b.span.start),
    shadows: shadows.sort((a, b) => a.span.start - b.span.start),
  };
}
