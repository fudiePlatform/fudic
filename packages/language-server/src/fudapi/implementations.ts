/**
 * Who implements each declaration of a `.fudapi` (SDD-75 §4.2): the `.handle(`, `.check(`,
 * `.client(`, `.server(` and `.implement(` called on a name imported from `fudic:<id>`, in the
 * scripts of the folders the host names for it.
 *
 * One Oxc parse per file, kept until the watcher says the file changed; a file that does not
 * parse adds nothing and costs the rest nothing. The folders are listed again after any change
 * of a script, which is also how a new or a deleted one is seen.
 */

import { parseSync, type CallExpression } from 'oxc-parser';
import type { Range } from 'vscode-languageserver-protocol';
import { rangeOf } from './document.js';
import type { ApiFs } from './fs.js';

/** What a handler calls on a piece of `fudic:<id>`; a pipe, `implement`. */
export type ImplementationMethod = 'handle' | 'check' | 'client' | 'server' | 'implement';

/** One call that implements a declaration. */
export interface Implementation {
  /** The `<id>` of `fudic:<id>`, as the script imports it. */
  readonly id: string;
  /** The name the module exports, whatever the script calls it locally. */
  readonly name: string;
  readonly method: ImplementationMethod;
  readonly file: string;
  /** The method's name in the call: where a click lands. */
  readonly range: Range;
}

const METHODS: ReadonlySet<string> = new Set<ImplementationMethod>(['handle', 'check', 'client', 'server', 'implement']);
const SCRIPT = /\.[cm]?[jt]s$/u;
const PREFIX = 'fudic:';

export class ImplementationIndex {
  readonly #fs: ApiFs;
  /** The scripts under each folder, while none changed. */
  readonly #lists = new Map<string, readonly string[]>();
  /** What each script implements, while it did not change. */
  readonly #found = new Map<string, readonly Implementation[]>();

  constructor(fs: ApiFs) {
    this.#fs = fs;
  }

  /** The calls on pieces of `fudic:<id>` in the scripts under `folders`. */
  of(folders: readonly string[], id: string): readonly Implementation[] {
    return folders
      .flatMap((folder) => this.#scripts(folder))
      .flatMap((file) => this.#scan(file))
      .filter((found) => found.id === id);
  }

  /** Whether a changed file can change what this index says: a script. */
  static affects(path: string): boolean {
    return SCRIPT.test(path);
  }

  /** Forget a script that changed, was created or was removed. */
  invalidate(path: string): void {
    this.#found.delete(path);
    this.#lists.clear();
  }

  /** Every script under a folder, `node_modules` and dot folders left out. */
  #scripts(folder: string): readonly string[] {
    const known = this.#lists.get(folder);
    if (known !== undefined) return known;
    const out: string[] = [];
    for (const entry of this.#fs.list(folder)) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const path = `${folder}/${entry.name}`;
      if (entry.directory) out.push(...this.#scripts(path));
      else if (SCRIPT.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(path);
    }
    this.#lists.set(folder, out);
    return out;
  }

  #scan(file: string): readonly Implementation[] {
    const known = this.#found.get(file);
    if (known !== undefined) return known;
    const found = implementationsIn(file, this.#fs.readFile(file) ?? '');
    this.#found.set(file, found);
    return found;
  }
}

/** The calls of a script that implement a piece of a `fudic:` module; none when it does not parse. */
export function implementationsIn(file: string, text: string): readonly Implementation[] {
  const parsed = parseSync(file, text, { sourceType: 'module' });
  if (parsed.errors.length > 0) return [];

  const imported = new Map<string, { readonly id: string; readonly name: string }>();
  for (const statement of parsed.program.body) {
    if (statement.type !== 'ImportDeclaration' || !statement.source.value.startsWith(PREFIX)) continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type !== 'ImportSpecifier') continue;
      const name = specifier.imported.type === 'Literal' ? specifier.imported.value : specifier.imported.name;
      imported.set(specifier.local.name, { id: statement.source.value.slice(PREFIX.length), name });
    }
  }

  const out: Implementation[] = [];
  visit(parsed.program, (node) => {
    if (node.type !== 'CallExpression') return;
    const callee = (node as CallExpression).callee;
    if (callee.type !== 'MemberExpression' || callee.computed || callee.object.type !== 'Identifier') return;
    const piece = imported.get(callee.object.name);
    const method = callee.property.type === 'Identifier' ? callee.property.name : '';
    if (piece === undefined || !METHODS.has(method)) return;
    out.push({ ...piece, method: method as ImplementationMethod, file, range: rangeOf(file, text, callee.property) });
  });
  return out;
}

/** Every node under `node`, depth first. */
function visit(node: unknown, see: (node: { readonly type: unknown }) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) visit(item, see);
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  see(node as { readonly type: unknown });
  for (const value of Object.values(node)) visit(value, see);
}
