/**
 * Completion after `@render ` (SDD-29 §4.11, completed by SDD-48).
 *
 *     @render |         →  the file's own snippets, the ones it imports, and each namespace
 *     @render campos.|  →  the snippets of the file linked `as="campos"`
 *
 * The names come from the parse — this file's declarations and the index's entry for each
 * linked file — so the list is there whether or not the TypeScript program is alive, which is
 * the rule the template scope already lives by.
 */

import { readSnippetLink, span, type Span } from '@fudic/compiler';
import type { CachedDocument } from '../document-cache.js';
import type { SnippetSignature } from '../mode.js';
import { snippetsOf } from '../mode.js';
import type { WorkspaceIndex } from '../workspace-index.js';

/** The caret after `@render `: the namespace already written, and the name being typed. */
export interface RenderContext {
  readonly namespace?: string;
  readonly span: Span;
}

/** The `@render` context at `offset`, or nothing. */
export function renderContextAt(source: string, offset: number): RenderContext | undefined {
  const match = /@render\s+(?:([A-Za-z_$][\w$]*)\.)?([\w$]*)$/u.exec(source.slice(0, offset));
  if (match === null) return undefined;
  const name = match[2] as string;
  const at = span(offset - name.length, offset);
  return match[1] === undefined ? { span: at } : { namespace: match[1], span: at };
}

/** One offer: a snippet to call, or a namespace to open. */
export type RenderOffer =
  | { readonly kind: 'snippet'; readonly name: string; readonly signature: string }
  | { readonly kind: 'namespace'; readonly name: string };

/** What `@render` may name at this context, local snippets first. */
export function renderOffers(cached: CachedDocument, index: WorkspaceIndex, at: RenderContext): readonly RenderOffer[] {
  const linked = cached.document.snippetLinks.map(readSnippetLink);
  const fileOf = (href: string): readonly SnippetSignature[] =>
    index.resolve(cached.path, href)?.snippets ?? [];

  if (at.namespace !== undefined) {
    const link = linked.find((l) => l.namespace === at.namespace);
    return link === undefined ? [] : fileOf(link.href).map((s) => ({ kind: 'snippet', ...s }));
  }
  const offers: RenderOffer[] = snippetsOf(cached.source, cached.document).map((s) => ({ kind: 'snippet', ...s }));
  for (const link of linked) {
    if (link.namespace !== undefined) offers.push({ kind: 'namespace', name: link.namespace });
    else offers.push(...fileOf(link.href).map((s): RenderOffer => ({ kind: 'snippet', ...s })));
  }
  return offers;
}
