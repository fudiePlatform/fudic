/**
 * The per-document cache (SDD-24 §4.5).
 *
 * A `.fud` is not parsed twice per keystroke: the three virtuals, the diagnostics and the
 * semantic tokens all come out of the same AST, keyed by document version.
 *
 * The virtuals carry a second key — the revision of the workspace index — because what a tag
 * resolves to is not a property of the file alone: creating `app-card.fud` changes the
 * projection of every page that links it. Recomputing them lazily, on the next request for
 * that file, is what keeps a `fudic generate` from repainting the whole workspace: the AST
 * and its Oxc batch, which are the expensive halves, survive untouched.
 *
 * Nothing here is shared with the Vite plugin. They are two processes with no channel
 * between them, and serializing an AST over IPC would cost more than re-parsing.
 */

import { emitVirtualFiles, type FileRegistry, type VirtualFile } from '@fudic/language-core';
import type { Diagnostic, StructuredDocument } from '@fudic/compiler';
import { batchDocumentJs, type DocumentJs } from './js-batch.js';
import { createFileRegistry } from './file-registry.js';
import { parseFud } from './parse.js';
import { toPosix } from './paths.js';
import type { WorkspaceIndex } from './workspace-index.js';

/** Everything the server knows about one open document at one version. */
export interface CachedDocument {
  /** Absolute POSIX path of the `.fud`. */
  readonly path: string;
  readonly version: number;
  readonly source: string;
  readonly document: StructuredDocument;
  /** Parse diagnostics plus the Oxc syntax errors, all in `.fud` coordinates. */
  readonly diagnostics: readonly Diagnostic[];
  readonly js: DocumentJs;
  readonly registry: FileRegistry;
  readonly virtuals: readonly VirtualFile[];
}

/** The parse half of an entry: keyed by version alone. */
interface ParsedEntry {
  readonly version: number;
  readonly source: string;
  readonly document: StructuredDocument;
  readonly diagnostics: readonly Diagnostic[];
  readonly js: DocumentJs;
}

/** The projection half: keyed by version AND by the revision of the index. */
interface ProjectedEntry {
  readonly revision: number;
  readonly registry: FileRegistry;
  readonly virtuals: readonly VirtualFile[];
  readonly cached: CachedDocument;
}

interface Entry {
  readonly parsed: ParsedEntry;
  projected?: ProjectedEntry;
}

export class DocumentCache {
  readonly #index: WorkspaceIndex;
  readonly #entries = new Map<string, Entry>();

  constructor(index: WorkspaceIndex) {
    this.#index = index;
  }

  /**
   * The document at this version, parsed and projected — reusing whatever is still valid.
   *
   * Same path, same version, same index revision ⇒ the very same object, which is how the
   * "one parse per keystroke" invariant is observable at all.
   */
  get(path: string, version: number, source: string): CachedDocument {
    const key = toPosix(path);
    const entry = this.#entryFor(key, version, source);
    const revision = this.#index.revision;

    if (entry.projected === undefined || entry.projected.revision !== revision) {
      entry.projected = this.#project(key, entry.parsed, revision);
    }
    return entry.projected.cached;
  }

  /** Forget one document. The index is not touched: this is the editor closing a file. */
  invalidate(path: string): void {
    this.#entries.delete(toPosix(path));
  }

  /** Forget everything. Used on shutdown; the server keeps no state on disk (§4.6). */
  clear(): void {
    this.#entries.clear();
  }

  #entryFor(key: string, version: number, source: string): Entry {
    const existing = this.#entries.get(key);
    if (existing !== undefined && existing.parsed.version === version) return existing;

    const { document, diagnostics } = parseFud(source);
    const js = batchDocumentJs(source, document);
    const entry: Entry = {
      parsed: {
        version,
        source,
        document,
        diagnostics: [...diagnostics, ...js.diagnostics],
        js,
      },
    };
    this.#entries.set(key, entry);
    return entry;
  }

  #project(key: string, parsed: ParsedEntry, revision: number): ProjectedEntry {
    const registry = createFileRegistry(key, parsed.document, this.#index);
    const virtuals = emitVirtualFiles({
      source: parsed.source,
      fileName: key,
      document: parsed.document,
      registry,
      js: { result: parsed.js.result, neutral: parsed.js.neutral },
    });

    return {
      revision,
      registry,
      virtuals,
      cached: {
        path: key,
        version: parsed.version,
        source: parsed.source,
        document: parsed.document,
        diagnostics: parsed.diagnostics,
        js: parsed.js,
        registry,
        virtuals,
      },
    };
  }
}
