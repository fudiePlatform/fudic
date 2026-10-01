/**
 * Shared `.fud` parse: drives the hand-written compiler pipeline (parse + constructs
 * + structure) exactly like the emit does, so plugin passes see the authentic AST.
 * Never Vite — the parser lives in `@fudic/compiler`.
 */

import {
  atConstructs as constructs,
  parseDocument,
  structureDocument,
  type Diagnostic,
  type StructuredDocument,
} from '@fudic/compiler';

/** Parse a `.fud` source to its structured document. */
export function parseFud(source: string): StructuredDocument {
  return parseFudReporting(source).document;
}

/**
 * The same parse, with what it had to say. The parser never throws, it reports; a caller that
 * keeps only the tree drops those reports on the floor (SDD-35 §1.1).
 */
export function parseFudReporting(source: string): {
  readonly document: StructuredDocument;
  readonly diagnostics: readonly Diagnostic[];
} {
  const html = parseDocument(source, { atConstructs: constructs });
  const structured = structureDocument(source, html.value);
  return { document: structured.value, diagnostics: [...html.diagnostics, ...structured.diagnostics] };
}
