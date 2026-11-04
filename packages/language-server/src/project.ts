/**
 * The project as the editor knows it, without an editor: the same workspace index, the same
 * projection and the same repair table, for a tool that reads and fixes a project on disk — the
 * MCP. What it answers is what the light bulb offers to whoever opens the file in VS Code.
 */

import type * as ts from 'typescript';
import type { SourceDiagnostic } from '@fudic/diagnostics';
import { nodeFileSystem, toPosix } from '@fudic/typecheck';
import { DocumentCache } from './document-cache.js';
import { ProjectSymbols, type Description, type Handler, type Piece, type ProjectSymbol, type SymbolKind } from './project-symbols.js';
import { repairsFor, type Repair } from './repairs.js';
import type { FileSystemScanner } from './types.js';
import { WorkspaceIndex } from './workspace-index.js';

export type { Repair, RepairEdit } from './repairs.js';
export {
  SYMBOL_KINDS,
  exampleOf,
  routePattern,
  type ComponentDescription,
  type DeclarationDescription,
  type Handler,
  type Piece,
  type Description,
  type Place,
  type ProjectSymbol,
  type RouteDescription,
  type SymbolKind,
  type TokenDescription,
} from './project-symbols.js';

export interface ProjectService {
  /** The repairs of one diagnostic, as the editor's light bulb offers them. */
  repairs(file: string, diagnostic: SourceDiagnostic): readonly Repair[];
  /** Every symbol of the project and its libraries, in a stable order. */
  symbols(kind?: SymbolKind): readonly ProjectSymbol[];
  /** What one name — a tag, a route, a declaration, a token — is, in full. */
  describe(name: string): Description | undefined;
  /** Every name `describe` knows. */
  names(): readonly string[];
  /** What the `.fudapi` of `<id>` asks to be implemented; undefined when there is no such `<id>`. */
  handlers(id: string): readonly Handler[] | undefined;
  /** The components and routes of the project itself, as their phases are read. */
  pieces(): readonly Piece[];
  /** A file changed on disk: the next call re-reads it. */
  invalidate(path: string): void;
}

export interface ProjectOptions {
  /** The disk. By default, the real one. */
  readonly fs?: FileSystemScanner;
  /**
   * The project's TypeScript service, which knows a loop's element type: the one its check
   * already holds. Absent, or answering nothing, a repair that needs a type is not offered.
   */
  readonly typescript?: () => ts.LanguageService | undefined;
}

/** The project at `root`. Nothing is read until the first question. */
export function openProject(root: string, options: ProjectOptions = {}): ProjectService {
  const fs = options.fs ?? nodeFileSystem();
  let index: WorkspaceIndex | undefined;
  let cache: DocumentCache | undefined;
  /** The text each file was last read as, and the version that text is cached under. */
  const versions = new Map<string, { readonly text: string; readonly version: number }>();
  let next = 0;

  let known: ProjectSymbols | undefined;
  const typescript = (): ts.LanguageService | undefined => options.typescript?.();

  const mounted = (): { index: WorkspaceIndex; cache: DocumentCache; symbols: ProjectSymbols } => {
    if (index === undefined || cache === undefined || known === undefined) {
      index = new WorkspaceIndex(fs);
      index.scan(root);
      cache = new DocumentCache(index);
      known = new ProjectSymbols({ root: toPosix(root), index, typescript });
    }
    return { index, cache, symbols: known };
  };

  return {
    repairs(file, diagnostic) {
      const path = toPosix(file);
      const text = fs.readFile(path);
      if (text === undefined || !path.endsWith('.fud')) return [];
      const known = versions.get(path);
      const version = known !== undefined && known.text === text ? known.version : ++next;
      versions.set(path, { text, version });
      const { index: workspace, cache: documents } = mounted();
      const cached = documents.get(path, version, text);
      const service = typescript();
      return repairsFor({ cached, index: workspace, ...(service !== undefined ? { typescript: service } : {}) }, diagnostic);
    },

    symbols: (kind) => mounted().symbols.symbols(kind),
    describe: (name) => mounted().symbols.describe(name),
    names: () => mounted().symbols.names(),
    handlers: (id) => mounted().symbols.handlers(id),
    pieces: () => mounted().symbols.pieces(),

    invalidate(path) {
      if (index === undefined || cache === undefined || known === undefined) return;
      const posix = toPosix(path);
      known.invalidate(posix);
      if (posix.endsWith('.fud')) {
        // Read again, or dropped when it is gone: what a tag resolves to may have changed.
        index.upsert(posix);
        cache.invalidate(posix);
      } else if (posix.endsWith('.fudapi')) {
        cache.reprojectLinking(posix);
      }
    },
  };
}
