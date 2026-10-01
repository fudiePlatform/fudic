/**
 * `@fudic/diagnostics` — every fudic diagnostic. One code, one file, one typed function; the
 * folder `codes/` IS the catalogue. Everything is re-exported here and the package declares
 * `"sideEffects": false`, so a bundle only keeps the codes it calls.
 */

export type {
  Severity,
  FudCode,
  RelatedLocation,
  SourceDiagnostic,
  FileDiagnostic,
  ProjectDiagnostic,
  FudDiagnostic,
  SourceInput,
  FileInput,
} from './types.js';
export type { Span } from './span.js';
export { span, emptySpan, spanLength, isEmptySpan, mergeSpans, spanContains } from './span.js';
export type { Position, Range } from './position.js';
export { LineMap, rangeOf } from './linemap.js';
export type { Place, Rendered, FormatOptions } from './render.js';
export { render, format } from './render.js';
export { DOCS_BASE, docsUrl } from './docs.js';

// ── codes ──────────────────────────────────────────────────────────────────────
