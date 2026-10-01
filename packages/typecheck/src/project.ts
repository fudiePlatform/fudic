/**
 * The one recipe a `.fud` goes through before anyone typechecks it: parse → JS batch →
 * projection (SDD-24 §4.5, SDD-35 §4.1).
 *
 * The editor and the build both run it, and that is the whole reason it lives here. The editor
 * caches the two halves under different keys — the parse by document version, the projection
 * by the revision of its index — so they are exported apart as well as together; the build has
 * no versions and calls `projectFud`.
 */

import { emitVirtualFiles, type FileRegistry, type VirtualFile } from '@fudic/language-core';
import type { Diagnostic, HtmlDocument, StructuredDocument } from '@fudic/compiler';
import { batchDocumentJs, type DocumentJs } from './js-batch.js';
import { createFileRegistry } from './file-registry.js';
import type { LinkIndex } from './link-index.js';
import { parseFud } from './parse.js';
import { toPosix } from './paths.js';

/** The parse half: the tree, its Oxc batch and what both had to say. */
export interface ParsedSource {
  readonly source: string;
  readonly document: StructuredDocument;
  /** The flat tree `regionAt` answers over (BUG-22). */
  readonly html: HtmlDocument;
  /** Parse diagnostics plus the Oxc syntax errors, all in `.fud` coordinates. */
  readonly diagnostics: readonly Diagnostic[];
  readonly js: DocumentJs;
}

/** A `.fud` parsed and projected: everything a typecheck of it needs. */
export interface ProjectedFud extends ParsedSource {
  /** Absolute POSIX path of the `.fud`. */
  readonly path: string;
  readonly registry: FileRegistry;
  readonly virtuals: readonly VirtualFile[];
}

/** What `projectFud` takes. */
export interface ProjectInput {
  readonly path: string;
  readonly source: string;
  /** Where the file's `<link>`s resolve. */
  readonly index: LinkIndex;
}

/** Parse a source and run Oxc once over all its JS. Never throws. */
export function parseSource(source: string): ParsedSource {
  const { document, html, diagnostics } = parseFud(source);
  const js = batchDocumentJs(source, document);
  return { source, document, html, diagnostics: [...diagnostics, ...js.diagnostics], js };
}

/** Project a parsed source against the index its links resolve in. */
export function projectParsed(path: string, parsed: ParsedSource, index: LinkIndex): ProjectedFud {
  const key = toPosix(path);
  const registry = createFileRegistry(key, parsed.document, index);
  const virtuals = emitVirtualFiles({
    source: parsed.source,
    fileName: key,
    document: parsed.document,
    registry,
    // The whole batch, not just the neutral chunks: the projection needs the `@client`
    // regions for the reactive names (decision 84) and the attribute values for the shape
    // of a handler (decisions 96–98). Handing them over is what keeps Oxc at one
    // invocation per file.
    js: {
      result: parsed.js.result,
      neutral: parsed.js.neutral,
      client: parsed.js.client,
      // The `@server` regions too, since SDD-40: the route's `layout(ctx, data)` is looked
      // for in them, and what the projection does with it is give it the return type that
      // makes TypeScript the voice of the layout contract.
      server: parsed.js.regions.flatMap((r) => (r.part.type === 'server-region' ? [r.id] : [])),
      ast: (at) => parsed.js.ast(at),
    },
  });

  return { ...parsed, path: key, registry, virtuals };
}

/** parse → JS batch → projection, in one call. */
export function projectFud(input: ProjectInput): ProjectedFud {
  return projectParsed(input.path, parseSource(input.source), input.index);
}
