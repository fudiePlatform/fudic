/**
 * `strategy()` extraction (SDD-20 §4.8). The strategy of a route is declared IN THE
 * PAGE — making 100 routes converge on one config file is how a build config becomes a
 * merge conflict — and the plugin reads the call STATICALLY. It is never executed.
 *
 * Only an object literal with literal values is accepted: anything the build cannot
 * read without running code is FUD0393, and the route falls back to the default.
 */

import { type OxcNode } from '@fudic/compiler';
import { type CachePolicy, type RouteMode } from '@fudic/transport';
import {
  type FudicDiagnostic,
  FUD_STRATEGY_DUPLICATE,
  FUD_STRATEGY_NOT_LITERAL,
} from './diagnostics.js';

export interface StrategyDecl {
  readonly mode?: RouteMode;
  readonly data?: { readonly ttl?: string; readonly policy?: CachePolicy };
  readonly page?: { readonly cache?: 'never' | 'persist'; readonly ttl?: string };
}

export interface StrategyAnalysis {
  /** Whether the page called `strategy()` at all — the page is then the authority. */
  readonly declared: boolean;
  readonly strategy: StrategyDecl;
  readonly diagnostics: readonly FudicDiagnostic[];
}

export const NO_STRATEGY: StrategyAnalysis = { declared: false, strategy: {}, diagnostics: [] };

// ── Typed access over the untyped Oxc node (quarantined, as in the emit) ──
const is = (node: OxcNode | undefined, type: string): boolean => node?.type === type;
const field = (node: OxcNode, key: string): OxcNode | undefined => node[key] as OxcNode | undefined;
const fieldArray = (node: OxcNode, key: string): OxcNode[] => (node[key] as OxcNode[] | undefined) ?? [];

const LITERALS = new Set(['StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'Literal']);

/** A literal value (string/number/boolean or a nested object of them), or `undefined`. */
function literalOf(node: OxcNode | undefined): unknown {
  if (node === undefined) {
    return undefined;
  }
  if (LITERALS.has(node.type as string)) {
    return node['value'];
  }
  if (is(node, 'ObjectExpression')) {
    const out: Record<string, unknown> = {};
    for (const property of fieldArray(node, 'properties')) {
      if (!is(property, 'ObjectProperty') && !is(property, 'Property')) {
        return undefined; // a spread: not statically readable
      }
      const key = field(property, 'key');
      const name = key === undefined ? undefined : (key['name'] ?? key['value']);
      const value = literalOf(field(property, 'value'));
      if (typeof name !== 'string' || value === undefined) {
        return undefined;
      }
      out[name] = value;
    }
    return out;
  }
  return undefined;
}

/** The `strategy(...)` call of one statement, if that is what it is. */
function strategyCall(statement: OxcNode): OxcNode | null {
  if (!is(statement, 'ExpressionStatement')) {
    return null;
  }
  const call = field(statement, 'expression');
  if (call === undefined || !is(call, 'CallExpression')) {
    return null;
  }
  const callee = field(call, 'callee');
  if (callee === undefined || !is(callee, 'Identifier') || callee['name'] !== 'strategy') {
    return null;
  }
  return call;
}

/** Read the page's declared strategy from the top-level statements of its `@code`. */
export function strategyFrom(statements: readonly OxcNode[], file: string): StrategyAnalysis {
  const diagnostics: FudicDiagnostic[] = [];
  let found: StrategyDecl | null = null;

  for (const statement of statements) {
    const call = strategyCall(statement);
    if (call === null) {
      continue;
    }
    if (found !== null) {
      diagnostics.push({
        code: FUD_STRATEGY_DUPLICATE,
        message: 'A page may call strategy() only once; the first call wins',
        file,
      });
      continue;
    }
    const argument = fieldArray(call, 'arguments')[0];
    const value = literalOf(argument);
    if (value === undefined || typeof value !== 'object') {
      diagnostics.push({
        code: FUD_STRATEGY_NOT_LITERAL,
        message: 'strategy() needs an object literal with literal values (it is read statically, never run)',
        file,
      });
      found = {};
      continue;
    }
    found = value as StrategyDecl;
  }

  return found === null
    ? { declared: false, strategy: {}, diagnostics }
    : { declared: true, strategy: found, diagnostics };
}
