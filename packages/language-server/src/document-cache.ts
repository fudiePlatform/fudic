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
 * The recipe itself — parse, JS batch, projection — is `@fudic/typecheck`'s, the one the build
 * runs too (SDD-35 §4.1). What is the editor's own is only the caching around it.
 */

import { parseSource, projectParsed, toPosix, type ParsedSource, type ProjectedFud } from '@fudic/typecheck';
import type { WorkspaceIndex } from './workspace-index.js';

/** Everything the server knows about one open document at one version. */
export interface CachedDocument extends ProjectedFud {
  readonly version: number;
}

/** The parse half of an entry: keyed by version alone. */
interface ParsedEntry {
  readonly version: number;
  readonly parsed: ParsedSource;
}

/** The projection half: keyed by version AND by the revision of the index. */
interface ProjectedEntry {
  readonly revision: number;
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
      const projected = projectParsed(key, entry.parsed.parsed, this.#index);
      entry.projected = { revision, cached: { ...projected, version: entry.parsed.version } };
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

    const entry: Entry = { parsed: { version, parsed: parseSource(source) } };
    this.#entries.set(key, entry);
    return entry;
  }
}
