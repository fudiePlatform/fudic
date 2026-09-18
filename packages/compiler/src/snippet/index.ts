/**
 * Reusable markup snippets (SDD-29). Canonical re-export.
 */

export type {
  SnippetNode,
  SnippetDeclNode,
  RenderCallNode,
  RenderArg,
  PositionalArg,
  NamedArg,
} from './nodes.js';
export { parseSnippet } from './parser.js';
export type { SnippetParam } from './signature.js';
export { registerSignature, readParams } from './signature.js';
