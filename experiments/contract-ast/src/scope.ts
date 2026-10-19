/**
 * Names across files. Oxc parses but resolves nothing: this is the piece the extractor has to
 * bring itself. Top-level declarations and imports per file, exports (own, re-exported and
 * `export *`), and a lookup that follows them to a declaration or to a fudic builtin.
 *
 * Two namespaces, as in TS: a `typeof x` looks for a value, a type reference for a type.
 */

import { existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { child, children, nameOf, str, type Node } from './ast.ts';
import type { Parsed, Project } from './project.ts';

export type Space = 'type' | 'value';

type Binding =
  | { readonly kind: 'import'; readonly from: string; readonly imported: string; readonly node: Node }
  | { readonly kind: 'decl'; readonly node: Node };

type Export =
  | { readonly kind: 'local'; readonly local: string }
  | { readonly kind: 'from'; readonly from: string; readonly imported: string };

interface FileScope {
  readonly types: Map<string, Binding>;
  readonly values: Map<string, Binding>;
  readonly exports: Map<string, Export>;
  readonly stars: string[];
}

export type Resolved =
  | { readonly kind: 'builtin'; readonly module: string; readonly name: string }
  | { readonly kind: 'decl'; readonly file: Parsed; readonly node: Node; readonly name: string }
  | { readonly kind: 'missing'; readonly why: string };

const TYPE_DECLS = new Set(['TSInterfaceDeclaration', 'TSTypeAliasDeclaration']);
const BOTH_DECLS = new Set(['ClassDeclaration', 'TSEnumDeclaration', 'TSModuleDeclaration']);

export class Scopes {
  readonly #project: Project;
  readonly #scopes = new Map<Parsed, FileScope>();

  constructor(project: Project) {
    this.#project = project;
  }

  /** What `name` means in `file`, followed through imports and re-exports. */
  lookup(file: Parsed, name: string, space: Space): Resolved {
    const binding = (space === 'type' ? this.#scope(file).types : this.#scope(file).values).get(name);
    if (binding === undefined) return { kind: 'missing', why: `"${name}" is not declared or imported in ${file.rel}` };
    if (binding.kind === 'decl') return { kind: 'decl', file, node: binding.node, name };
    return this.#follow(file, binding.from, binding.imported, space, new Set());
  }

  /** The declaration a file exports under `name` (`'default'` for its default export). */
  exported(file: Parsed, name: string, space: Space): Resolved {
    return this.#exported(file, name, space, new Set());
  }

  #follow(from: Parsed, specifier: string, imported: string, space: Space, seen: Set<string>): Resolved {
    if (specifier.startsWith('@fudic/')) return { kind: 'builtin', module: specifier, name: imported };
    if (!specifier.startsWith('.')) return { kind: 'missing', why: `"${specifier}" is an external module: its types are not read` };
    const target = this.#module(from, specifier);
    if (target === null) return { kind: 'missing', why: `"${specifier}" does not resolve to a file from ${from.rel}` };
    if (imported === '*') return { kind: 'missing', why: `namespace import of "${specifier}" is not followed` };
    return this.#exported(target, imported, space, seen);
  }

  #exported(file: Parsed, name: string, space: Space, seen: Set<string>): Resolved {
    const key = `${file.path}#${name}#${space}`;
    if (seen.has(key)) return { kind: 'missing', why: `export cycle through "${name}" in ${file.rel}` };
    seen.add(key);
    const scope = this.#scope(file);
    const own = scope.exports.get(name);
    if (own !== undefined) {
      if (own.kind === 'from') return this.#follow(file, own.from, own.imported, space, seen);
      const binding = (space === 'type' ? scope.types : scope.values).get(own.local);
      if (binding === undefined) return { kind: 'missing', why: `${file.rel} exports "${name}" but declares no ${space} by that name` };
      if (binding.kind === 'decl') return { kind: 'decl', file, node: binding.node, name: own.local };
      return this.#follow(file, binding.from, binding.imported, space, seen);
    }
    for (const star of scope.stars) {
      const found = this.#follow(file, star, name, space, seen);
      if (found.kind !== 'missing') return found;
    }
    return { kind: 'missing', why: `${file.rel} does not export "${name}"` };
  }

  #module(from: Parsed, specifier: string): Parsed | null {
    const base = resolvePath(dirname(from.path), specifier);
    for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
      if (candidate.endsWith('.ts') && existsSync(candidate)) return this.#project.parse(candidate);
    }
    return null;
  }

  #scope(file: Parsed): FileScope {
    const known = this.#scopes.get(file);
    if (known !== undefined) return known;
    const scope: FileScope = { types: new Map(), values: new Map(), exports: new Map(), stars: [] };
    for (const statement of children(file.program, 'body')) collect(statement, scope);
    this.#scopes.set(file, scope);
    return scope;
  }
}

function collect(statement: Node, scope: FileScope): void {
  switch (statement.type) {
    case 'ImportDeclaration': {
      const from = str(child(statement, 'source') ?? statement, 'value') ?? '';
      for (const spec of children(statement, 'specifiers')) {
        const local = nameOf(child(spec, 'local'));
        if (local === null) continue;
        const imported =
          spec.type === 'ImportDefaultSpecifier' ? 'default' :
          spec.type === 'ImportNamespaceSpecifier' ? '*' :
          nameOf(child(spec, 'imported')) ?? local;
        const binding: Binding = { kind: 'import', from, imported, node: spec };
        scope.types.set(local, binding);
        scope.values.set(local, binding);
      }
      return;
    }
    case 'ExportNamedDeclaration': {
      const declaration = child(statement, 'declaration');
      if (declaration !== null) {
        for (const name of declare(declaration, scope)) scope.exports.set(name, { kind: 'local', local: name });
        return;
      }
      const source = child(statement, 'source');
      for (const spec of children(statement, 'specifiers')) {
        const local = nameOf(child(spec, 'local'));
        const exported = nameOf(child(spec, 'exported')) ?? local;
        if (local === null || exported === null) continue;
        scope.exports.set(exported, source === null
          ? { kind: 'local', local }
          : { kind: 'from', from: str(source, 'value') ?? '', imported: local });
      }
      return;
    }
    case 'ExportDefaultDeclaration': {
      const declaration = child(statement, 'declaration');
      if (declaration === null) return;
      if (declaration.type === 'Identifier') {
        const local = nameOf(declaration);
        if (local !== null) scope.exports.set('default', { kind: 'local', local });
        return;
      }
      const [name] = declare(declaration, scope);
      if (name !== undefined) scope.exports.set('default', { kind: 'local', local: name });
      return;
    }
    case 'ExportAllDeclaration': {
      const from = str(child(statement, 'source') ?? statement, 'value');
      const as = nameOf(child(statement, 'exported'));
      if (from !== null && as === null) scope.stars.push(from);
      if (from !== null && as !== null) scope.exports.set(as, { kind: 'from', from, imported: '*' });
      return;
    }
    default:
      declare(statement, scope);
  }
}

/** Registers a declaration in its namespace(s); returns the names it declares. */
function declare(node: Node, scope: FileScope): string[] {
  if (node.type === 'VariableDeclaration') {
    const names: string[] = [];
    for (const declarator of children(node, 'declarations')) {
      const name = nameOf(child(declarator, 'id'));
      if (name === null) continue;
      scope.values.set(name, { kind: 'decl', node: declarator });
      names.push(name);
    }
    return names;
  }
  const name = nameOf(child(node, 'id'));
  if (name === null) return [];
  const binding: Binding = { kind: 'decl', node };
  if (TYPE_DECLS.has(node.type)) scope.types.set(name, binding);
  else if (BOTH_DECLS.has(node.type)) {
    scope.types.set(name, binding);
    scope.values.set(name, binding);
  } else if (node.type === 'FunctionDeclaration' || node.type === 'TSDeclareFunction') scope.values.set(name, binding);
  else return [];
  return [name];
}
