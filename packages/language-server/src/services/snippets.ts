/**
 * The snippet catalogue (SDD-28).
 *
 * Half the value of a snippet is the GATE, not the body: `@if` belongs in markup and not
 * inside `@code`, where `if` is TypeScript and TypeScript offers it; `@RenderBody()` belongs
 * in a layout and is `FUD0432` in a route; a document skeleton belongs in a file that has
 * nothing in it yet. That is why this lives in the server and not in a static snippet file of
 * the extension, which would offer everything everywhere and in VS Code only.
 *
 * Pure. Which snippets apply is a question about an offset and a parsed document; turning one
 * into a `CompletionItem` is the plugin's job.
 */

import type { CachedDocument } from '../document-cache.js';
import { isEmptyDocument } from './position.js';
import { isMarkupOffset } from './emmet.js';

/** Where a snippet may be offered. The three are exclusive and decided by offset. */
export type SnippetScope =
  /** The file has nothing in it yet: the only place a whole document may be inserted. */
  | 'empty-document'
  /** Element content — not a `<style>` body, not an interpolation, not `@code`. */
  | 'markup'
  /** Inside the `@code` block, where the language is TypeScript. */
  | 'code-block';

/**
 * The scope of an offset, or nothing when it is none of the three.
 *
 * `empty-document` is asked first and answers for every offset of an empty file: with no
 * content there is no markup and no `@code`, and the four skeletons are the only sensible
 * answer anywhere in it.
 *
 * The fourth case — the body of a `<style>` or a `<script>`, and the inside of an
 * interpolation — is deliberately none of them. It is CSS or an expression, and neither
 * wants a `@foreach`.
 */
export function scopeAt(document: CachedDocument, offset: number): SnippetScope | undefined {
  if (isEmptyDocument(document.source)) return 'empty-document';

  const code = document.document.code;
  if (code !== undefined && offset >= code.span.start && offset <= code.span.end) {
    return 'code-block';
  }
  return isMarkupOffset(document, offset) ? 'markup' : undefined;
}
