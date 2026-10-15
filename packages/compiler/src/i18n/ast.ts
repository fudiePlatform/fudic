/**
 * The little the translation passes read of an Oxc AST: typed access, the wrappers a value is
 * seen through, the names `@fudic/i18n` exports, and a generic walk.
 */

import type { OxcNode } from '../oxc/index.js';

export function isNode(value: unknown): value is OxcNode {
  return typeof value === 'object' && value !== null && typeof (value as OxcNode).type === 'string';
}

export const child = (node: OxcNode, key: string): OxcNode | undefined => {
  const value = node[key];
  return isNode(value) ? value : undefined;
};

/** A list field of the node, holes dropped. */
export const children = (node: OxcNode, key: string): readonly OxcNode[] => {
  const value = node[key];
  return Array.isArray(value) ? value.filter(isNode) : [];
};

/** The wrappers that do not change a value: parentheses and what TypeScript erases. */
const TRANSPARENT: ReadonlySet<string> = new Set([
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'ChainExpression',
]);

export function unwrap(node: OxcNode): OxcNode {
  let current = node;
  let inner = child(current, 'expression');
  while (TRANSPARENT.has(current.type) && inner !== undefined) {
    current = inner;
    inner = child(current, 'expression');
  }
  return current;
}

/** A string `Literal`'s value, or `undefined` when `node` is not one. */
export function stringLiteral(node: OxcNode): string | undefined {
  return node.type === 'Literal' && typeof node['value'] === 'string' ? node['value'] : undefined;
}

/** The specifier the compiler replaces names of. */
export const I18N_MODULE = '@fudic/i18n';

/** The names `@fudic/i18n` exports that the compiler replaces in a language's graph. */
export type I18nName = 't' | 'format' | 'locale';

/**
 * Local name → which name of `@fudic/i18n` it imports, read off the `import` statements among
 * `statements`. `import { t as tr }` maps `tr` to `t`. A namespace import is not followed: the
 * three names are written by name, which is what makes them extractable.
 */
export function i18nImports(statements: readonly OxcNode[]): ReadonlyMap<string, I18nName> {
  const names = new Map<string, I18nName>();
  for (const stmt of statements) {
    if (stmt.type !== 'ImportDeclaration' || stringLiteral(child(stmt, 'source')!) !== I18N_MODULE) continue;
    for (const spec of children(stmt, 'specifiers')) {
      if (spec.type !== 'ImportSpecifier') continue;
      const imported = child(spec, 'imported')!;
      const name = imported.type === 'Identifier' ? imported['name'] : imported['value'];
      if (name === 't' || name === 'format' || name === 'locale') {
        names.set(String(child(spec, 'local')!['name']), name);
      }
    }
  }
  return names;
}

/** Every node under `root`, depth first, parents before children, in source order. */
export function eachNode(root: unknown, visit: (node: OxcNode) => void): void {
  if (Array.isArray(root)) {
    for (const item of root) eachNode(item, visit);
    return;
  }
  if (!isNode(root)) return;
  visit(root);
  for (const [key, value] of Object.entries(root)) {
    if (key !== 'parent' && typeof value === 'object') eachNode(value, visit);
  }
}
