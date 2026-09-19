/**
 * Snippet resolution, checking and expansion (SDD-29 §4.3–§4.8). Canonical re-export.
 */

export type { SnippetLink } from './links.js';
export { readSnippetLink } from './links.js';
export type { ResolvedSnippet, SnippetScope } from './scope.js';
export { SnippetRegistry, EMPTY_SCOPE } from './scope.js';
