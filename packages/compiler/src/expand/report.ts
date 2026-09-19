/**
 * Diagnostics, back in the coordinates of the files their authors can open (SDD-29 §5).
 *
 * Everything that runs after the expansion — the semantic pass, the emit, the contract
 * checks — speaks in offsets of the SYNTHETIC source, because that is the text it was given.
 * A host reports against files, so the two have to meet somewhere, and this is where: one
 * pass at the boundary, over the list a host is about to publish.
 *
 * A diagnostic that lands inside the body of an imported snippet comes back carrying that
 * file. It is the reading criterion 34 asks for — the error is in the snippet, and the
 * `@render` that pulled it in is what the author of the page can act on — and it is also the
 * only one that does not lie: those offsets exist in that file and in no other.
 */

import type { Diagnostic, RelatedLocation } from '../types/index.js';
import type { OffsetMap } from './offsets.js';

/**
 * Remap one list. A diagnostic already carrying a `file` is left alone: it was produced
 * before the expansion, about a file the expansion itself named.
 */
export function remapDiagnostics(
  diagnostics: readonly Diagnostic[],
  map: OffsetMap,
  entry: string,
): readonly Diagnostic[] {
  return diagnostics.map((d) => (d.file === undefined ? remap(d, map, entry) : d));
}

function remap(d: Diagnostic, map: OffsetMap, entry: string): Diagnostic {
  const found = map.spanOf(d.span);
  // No table, or a position past everything it holds: the file was not expanded and the span
  // is already where it says it is.
  if (found === undefined) return d;
  const related = d.related === undefined ? undefined : d.related.map((r) => remapRelated(r, map, entry));
  return {
    ...d,
    span: found.span,
    ...(found.file === entry ? {} : { file: found.file }),
    ...(related === undefined ? {} : { related }),
  };
}

function remapRelated(r: RelatedLocation, map: OffsetMap, entry: string): RelatedLocation {
  if (r.file !== undefined) return r;
  // The diagnostic that holds it already found its own place, so the table is not empty and
  // this one has an answer too: a position past everything it holds clamps to the last piece.
  const found = map.spanOf(r.span)!;
  return { ...r, span: found.span, ...(found.file === entry ? {} : { file: found.file }) };
}
