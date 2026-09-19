/**
 * Snippet resolution, checking and expansion (SDD-29 §4.3–§4.8). Canonical re-export.
 */

export type { SnippetLink } from './links.js';
export { readSnippetLink, staticAttribute } from './links.js';
export type { ResolvedSnippet, SnippetScope } from './scope.js';
export { SnippetRegistry, EMPTY_SCOPE } from './scope.js';
export type { BoundArgument, ResolvedCall, SnippetFrame } from './check.js';
export { checkRenderCall, checkRenderCalls } from './check.js';
export type { Origin } from './offsets.js';
export { OffsetMap } from './offsets.js';
export type { Expansion, DraggedLink } from './expand.js';
export { expandDocument } from './expand.js';
export { remapDiagnostics } from './report.js';
