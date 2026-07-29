/**
 * The `.fud` parse the whole server runs on (SDD-24 §4.5).
 *
 * The hand-written pipeline of the compiler, wired exactly as the emit wires it — never
 * Vite, never a second parser — so the editor sees the authentic tree. It returns the
 * diagnostics too: the parser emits instead of throwing, and those diagnostics are half of
 * what §4.4 forwards to the client.
 */

import {
  parseCodeBlock,
  parseControl,
  parseDirective,
  parseDocument,
  structureDocument,
  type AtConstructParser,
  type Diagnostic,
  type StructuredDocument,
} from '@fudic/compiler';

const constructs: AtConstructParser = { parseControl, parseCodeBlock, parseDirective };

/** A parsed document with everything the parse itself had to say about it. */
export interface ParsedFud {
  readonly document: StructuredDocument;
  readonly diagnostics: readonly Diagnostic[];
}

/** Parse a `.fud` source. Never throws: a half-written file is the normal state of an editor. */
export function parseFud(source: string): ParsedFud {
  const html = parseDocument(source, { atConstructs: constructs });
  const structured = structureDocument(source, html.value);

  return {
    document: structured.value,
    diagnostics: [...html.diagnostics, ...structured.diagnostics],
  };
}
