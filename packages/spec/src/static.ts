/**
 * Reading JavaScript without running it. A term module and a fixture file are parsed with Oxc,
 * once each, and their exports are read off the tree as literals: no `import()`, so no user
 * code runs inside the language server and no module cache goes stale when a file changes.
 */

import {
  parseSync,
  type ExportDefaultDeclarationKind,
  type Expression,
  type ObjectExpression,
  type ObjectProperty,
  type ParseResult as OxcResult,
  type PropertyKey,
  type StringLiteral,
} from 'oxc-parser';

/** Parses a module. Oxc never throws on broken input: it returns a partial tree and errors. */
export function parseModule(path: string, source: string, lang: 'js' | 'ts'): OxcResult {
  return parseSync(path, source, { lang, sourceType: 'module' });
}

/** One name a module exports by declaration, with where it is declared and its initializer. */
export interface ExportedBinding {
  readonly start: number;
  readonly end: number;
  /** The initializer of an `export const`; absent for an `export function`. */
  readonly init?: Expression;
}

/**
 * The bindings a module exports by declaration: `export const x = …` and `export (async)
 * function x`. Re-exports, `export { x }` and destructuring patterns name nothing a reader can
 * follow without resolving scopes, so they are not here.
 */
export function exportedBindings(program: OxcResult['program']): ReadonlyMap<string, ExportedBinding> {
  const bindings = new Map<string, ExportedBinding>();
  for (const statement of program.body) {
    if (statement.type !== 'ExportNamedDeclaration' || statement.declaration === null) continue;
    const declaration = statement.declaration;
    // A named export's function always has a name (only `export default` may omit it); the
    // `null` check is for the type, and a module with syntax errors is never read.
    if (declaration.type === 'FunctionDeclaration' && declaration.id !== null) {
      bindings.set(declaration.id.name, { start: declaration.id.start, end: declaration.id.end });
    } else if (declaration.type === 'VariableDeclaration') {
      for (const declarator of declaration.declarations) {
        const id = declarator.id;
        if (id.type !== 'Identifier') continue;
        bindings.set(id.name, {
          start: id.start,
          end: id.end,
          ...(declarator.init !== null ? { init: declarator.init } : {}),
        });
      }
    }
  }
  return bindings;
}

/** Looks through `( … )`, `… satisfies T` and `… as T` to the expression they wrap. */
export function unwrap(node: ExportDefaultDeclarationKind): ExportDefaultDeclarationKind {
  let current = node;
  while (
    current.type === 'ParenthesizedExpression' ||
    current.type === 'TSSatisfiesExpression' ||
    current.type === 'TSAsExpression'
  ) {
    current = current.expression;
  }
  return current;
}

/** The node as an object literal, looking through wrappers; undefined when it is not one. */
export function objectLiteral(node: ExportDefaultDeclarationKind): ObjectExpression | undefined {
  const inner = unwrap(node);
  return inner.type === 'ObjectExpression' ? inner : undefined;
}

export function isStringLiteral(node: ExportDefaultDeclarationKind | PropertyKey): node is StringLiteral {
  return node.type === 'Literal' && typeof node.value === 'string';
}

/** The plain properties of an object literal: spreads have no name to read. */
export function properties(object: ObjectExpression): readonly ObjectProperty[] {
  return object.properties.filter((p): p is ObjectProperty => p.type === 'Property');
}

/** The name of a property written as `name:` or `'name':`; undefined for a computed key. */
export function keyName(property: ObjectProperty): string | undefined {
  const key = property.key;
  if (property.computed) return undefined;
  if (key.type === 'Identifier') return key.name;
  return isStringLiteral(key) ? key.value : undefined;
}

/** The value of the first property called `key`, looking through wrappers. */
export function field(object: ObjectExpression, key: string): ExportDefaultDeclarationKind | undefined {
  const property = properties(object).find((p) => keyName(p) === key);
  return property === undefined ? undefined : unwrap(property.value);
}

/** The value of `key` when it is a string literal. */
export function stringField(object: ObjectExpression, key: string): StringLiteral | undefined {
  const value = field(object, key);
  return value !== undefined && isStringLiteral(value) ? value : undefined;
}
