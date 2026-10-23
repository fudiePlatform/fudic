/**
 * The JS of a `@code` block (SDD-23 §4.1, SDD-60 §4.8): browser code, all of it, emitted into
 * the client virtual. A `@server` or `@client` region still parsed out of an old file is read as
 * if it had no wrapper — its body is one more chunk — so it does not cascade into diagnostics
 * of its own (SDD-60 §3.14).
 */

import type { CodeBlockNode, Span } from '@fudic/compiler';

/**
 * The chunks of a `@code`, in source order (decision 34). A missing `@code` has none, rather
 * than a special case for callers.
 */
export function codeChunks(code: CodeBlockNode | undefined): readonly Span[] {
  return (code?.parts ?? []).map((part) => part.js);
}
