/**
 * Shared `.fud` parse: drives the hand-written compiler pipeline (parse + constructs
 * + structure) exactly like the emit does, so plugin passes see the authentic AST.
 * Never Vite — the parser lives in `@fudic/compiler`.
 */

import {
  atConstructs as constructs,
  parseDocument,
  structureDocument,
  type StructuredDocument,
} from '@fudic/compiler';

/** Parse a `.fud` source to its structured document. */
export function parseFud(source: string): StructuredDocument {
  return structureDocument(source, parseDocument(source, { atConstructs: constructs }).value).value;
}
