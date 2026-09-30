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

/**
 * The caret where an argument of a `@render` begins: right after `(`, after a `,`, or after a
 * `name:` — with at most a word typed, `@` included (SDD-48). What goes there is a value of the
 * scope, behind its `@`, or the name of a parameter.
 */
export interface RenderArgContext {
  readonly namespace?: string;
  readonly name: string;
  /** Whether a `name:` was just written, so only a value fits. */
  readonly afterLabel: boolean;
  /** The word under the caret, its `@` included, replaced by the item. */
  readonly span: Span;
  /** The labels this call already wrote. */
  readonly labels: readonly string[];
}

/** The `@render` argument context at `offset`, or nothing. */
export function renderArgContextAt(source: string, offset: number): RenderArgContext | undefined {
  const before = source.slice(0, offset);
  let open: { namespace?: string; name: string; at: number } | undefined;
  for (const m of before.matchAll(/@render\s+(?:([A-Za-z_$][\w$]*)\.)?([A-Za-z_$][\w$]*)\s*\(/gu)) {
    const at = (m.index ?? 0) + m[0].length;
    open = m[1] === undefined ? { name: m[2] as string, at } : { namespace: m[1], name: m[2] as string, at };
  }
  if (open === undefined) return undefined;
  const typed = source.slice(open.at, offset);
  // Still inside those parentheses: every `(` typed since is closed again.
  let depth = 0;
  for (const char of typed) {
    if (char === '(') depth++;
    else if (char === ')' && --depth < 0) return undefined;
  }
  const word = /(^|[,(:])\s*(@?[\w$]*)$/u.exec(typed);
  if (word === null || depth !== 0) return undefined;
  const w = word[2] as string;
  const close = source.indexOf(')', offset);
  const whole = source.slice(open.at, close === -1 ? source.length : close);
  const labels = [...whole.matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*:/gu)].map((m) => m[1] as string);
  return {
    ...(open.namespace !== undefined ? { namespace: open.namespace } : {}),
    name: open.name,
    afterLabel: word[1] === ':',
    span: span(offset - w.length, offset),
    labels,
  };
}

/** The parameter names of a signature as written — `(titulo: string, tono = "x")`. */
export function parameterNames(signature: string): readonly string[] {
  const inner = signature.replace(/^\(|\)$/gu, '');
  const names: string[] = [];
  let depth = 0;
  let from = 0;
  const take = (piece: string): void => {
    const m = /^\s*([A-Za-z_$][\w$]*)/u.exec(piece);
    if (m !== null) names.push(m[1] as string);
  };
  for (let i = 0; i < inner.length; i++) {
    const c = inner.charAt(i);
    if ('([{<'.includes(c)) depth++;
    else if (')]}>'.includes(c)) depth--;
    else if (c === ',' && depth === 0) {
      take(inner.slice(from, i));
      from = i + 1;
    }
  }
  take(inner.slice(from));
  return names;
}

/** The signature of the snippet a `@render` names, if the file can see it. */
export function signatureOf(
  cached: CachedDocument,
  index: WorkspaceIndex,
  at: { readonly namespace?: string; readonly name: string },
): string | undefined {
  const scope = at.namespace === undefined ? { span: span(0, 0) } : { namespace: at.namespace, span: span(0, 0) };
  const found = renderOffers(cached, index, scope).find((o) => o.kind === 'snippet' && o.name === at.name);
  return found?.kind === 'snippet' ? found.signature : undefined;
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
