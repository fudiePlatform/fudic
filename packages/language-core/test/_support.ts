/**
 * Test-only helpers: parse a `.fud` the way the compiler pipeline does, and drive Oxc over
 * a JS span. Lives in `test/`, so it stays out of the coverage denominator.
 */

import {
  JsBatch,
  atConstructs as constructs,
  parseDocument,
  structureDocument,
  type CodeBlockNode,
  type OxcNode,
  type Span,
  type StructuredDocument,
} from '@fudic/compiler';
import { emitVirtualFiles } from '../src/emit.js';
import type { FileRegistry, SnippetImport, VirtualFile } from '../src/types.js';

/** Full parse of a `.fud` source into its structured document. */
export function parseFud(source: string): StructuredDocument {
  const html = parseDocument(source, { atConstructs: constructs }).value;
  return structureDocument(source, html).value;
}

/** The `@code` of a parsed document, whatever its role. */
export function codeOf(doc: StructuredDocument): CodeBlockNode | undefined {
  return doc.code;
}

/** A `FileRegistry` backed by a plain map, for tests. */
export function registryOf(
  components: Readonly<Record<string, string>>,
  layout?: string,
  snippets: readonly SnippetImport[] = [],
): FileRegistry {
  return {
    component: (tag) => components[tag],
    layout: () => layout,
    snippets: () => snippets,
  };
}

/**
 * Parse a `.fud` and emit its client virtual through the real orchestrator.
 *
 * Through `emitVirtualFiles` and not straight into the client emitter, because the batch is
 * what half the projection depends on: the handler shapes, the reactive names and — since
 * SDD-29 — the free names of a snippet body. A helper that skipped it tested a projection
 * nobody runs.
 */
export function emitClient(
  source: string,
  fudPath = 'x.fud',
  registry: FileRegistry = registryOf({}),
): VirtualFile {
  const document = parseFud(source);
  return emitVirtualFiles({ source, fileName: fudPath, document, registry })[0]!;
}

/** Parse one JS span as top-level statements, with its offset mapper. */
export function statementsOf(
  source: string,
  js: Span,
): { statements: readonly OxcNode[]; mapSpan: (s: number, e: number) => Span } {
  const batch = new JsBatch(source);
  const id = batch.add('module-statements', js);
  const result = batch.parse().value;
  const ast = result.ast(id);
  return {
    statements: Array.isArray(ast) ? ast : [ast as OxcNode],
    mapSpan: (s, e) => result.mapSpan(s, e),
  };
}
