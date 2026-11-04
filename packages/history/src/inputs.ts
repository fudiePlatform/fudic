import { posix } from 'node:path';
import { API_EXTENSION } from '@fudic/api';
import { JsBatch, attributeValueSpan, span, type OxcNode } from '@fudic/compiler';
import { FIXTURE_EXTENSION, SPEC_EXTENSION } from '@fudic/spec';
import { FudIndex, attributeOf, batchDocumentJs, describeFud, linksOf, parseFud } from '@fudic/typecheck';
import { hashFiles } from './hash.js';
import { type HistoryIo, nodeIo } from './io.js';
import { pathOf, stemOf } from './unit.js';

/** The extension of a piece's unit tests, sibling of its `.fud`. */
export const TEST_EXTENSION = '.test.ts';

/** Everything next to a piece that is part of it. */
const SIBLINGS = ['.fud', SPEC_EXTENSION, FIXTURE_EXTENSION, TEST_EXTENSION, API_EXTENSION];

/** The statements that name another module. */
const IMPORTING = new Set(['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration']);

/** The modules a list of top-level statements imports or re-exports from, as written. */
function specifiersOf(statements: readonly OxcNode[]): readonly string[] {
  return statements.flatMap((statement) => {
    const source = statement['source'] as { readonly value: string } | null | undefined;
    return IMPORTING.has(statement.type) && source != null ? [source.value] : [];
  });
}

/**
 * What can change the result of a piece's tests and criteria: its siblings, every `.fud` it links,
 * every module of the project it imports, transitively. A published library is not in it: it
 * changes with the lockfile, which is not the piece's.
 */
export class InputGraph {
  /** Resolves a link the way the editor and the build do. Never swept: only its resolution is used. */
  readonly #index: FudIndex;

  constructor(private readonly io: HistoryIo) {
    this.#index = new FudIndex(io.fs, describeFud);
  }

  /** The files of a piece, absolute and with `/`. */
  filesOf(unit: string): ReadonlySet<string> {
    const seen = new Set<string>();
    const stem = stemOf(pathOf(unit, this.io));
    for (const extension of SIBLINGS) this.#visit(`${stem}${extension}`, seen);
    return seen;
  }

  #visit(path: string, seen: Set<string>): void {
    if (seen.has(path) || path.includes('/node_modules/')) return;
    seen.add(path);
    const source = this.io.fs.readFile(path);
    if (source === undefined || path.endsWith(API_EXTENSION)) return;
    const targets = path.endsWith('.fud') ? this.#fudTargets(path, source) : this.#moduleTargets(path, source);
    for (const target of targets) this.#visit(this.io.fs.realPath(target), seen);
  }

  /** A `.fud`'s own `.fudapi`, what it links (components, snippets, its layout, a `.fudapi`) and what its `@code` imports. */
  #fudTargets(path: string, source: string): readonly string[] {
    const { document } = parseFud(source);
    const links = linksOf(document).flatMap((link) => {
      const attribute = attributeOf(link.element, 'href');
      const value = attribute === undefined ? undefined : attributeValueSpan(source, attribute);
      return value === undefined || value.start === value.end
        ? []
        : [this.#index.serverPath(path, source.slice(value.start, value.end))];
    });
    const js = batchDocumentJs(source, document);
    // A chunk of `@code` is parsed as module statements: its AST is always their list.
    const imports = js.code.flatMap((id) => specifiersOf(js.result.ast(id) as readonly OxcNode[]));
    // Its own `.fudapi` is part of it, linked or not: a linked component is one with its contract.
    return [stemOf(path) + API_EXTENSION, ...links, ...imports.flatMap((specifier) => this.#resolveImport(path, specifier))];
  }

  /** What a TypeScript or JavaScript module imports. */
  #moduleTargets(path: string, source: string): readonly string[] {
    const batch = new JsBatch(source);
    const id = batch.add('module-statements', span(0, source.length));
    const statements = batch.parse().value.ast(id) as readonly OxcNode[];
    return specifiersOf(statements).flatMap((specifier) => this.#resolveImport(path, specifier));
  }

  /**
   * The file an import names, as TypeScript resolves it: with its extension, `.js` for a `.ts`,
   * none, or a folder's `index.ts`. A package name goes through the same resolution as a link.
   */
  #resolveImport(from: string, specifier: string): readonly string[] {
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) return [this.#index.serverPath(from, specifier)];
    const base = posix.join(posix.dirname(from), specifier);
    const found = [base, `${base}.ts`, base.replace(/\.js$/u, '.ts'), `${base}/index.ts`].find(
      (candidate) => this.io.fs.readFile(candidate) !== undefined,
    );
    return found === undefined ? [] : [found];
  }
}

/** The hash of entry, from the files as they are now. */
export async function inputsHash(unit: string, io: HistoryIo = nodeIo()): Promise<string> {
  return hashFiles(io, new InputGraph(io).filesOf(unit));
}
