/**
 * Shared type vocabulary of the compiler (SDD-01). The whole backbone
 * (SDD-02..14) imports from here without reimplementing. Canonical re-export.
 */

export type { Span } from './span.js';
export { span, emptySpan, spanLength, isEmptySpan, mergeSpans, spanContains } from './span.js';

export type { Severity, Diagnostic } from './diagnostic.js';
export { errorDiag, warningDiag, infoDiag, hintDiag } from './diagnostic.js';

export type { ParseResult } from './result.js';
export { ok, withDiagnostics, collectDiagnostics } from './result.js';

export type { Mode } from './mode.js';
export { ModeStack } from './mode.js';

export type { Node, HydratableNode } from './node.js';
