/**
 * The comments of a `.fud`, each in the language of its region: `@* … *@` in the markup,
 * `/* … *\/` in the `<style>`, `//` and `/* … *\/` in the JS (the `@code` and every expression).
 * They are what a `fud-disable` is written in; each comes as written, delimiters included.
 *
 * The flat tree tiles the whole file, so a walk over it meets every Razor comment of the markup
 * and every `<style>` body, whatever construct holds them. A Razor comment inside `@code` is not
 * a node — it is `FUD0114` — and is not a place to silence anything.
 */

import type { HtmlDocument } from '../html/index.js';
import type { JsBatchResult } from '../oxc/index.js';
import { cssComments } from '../css/comments.js';
import type { Span } from '../types/index.js';

export interface FudComment {
  readonly span: Span;
  readonly text: string;
}

/** Every comment of the file, in source order. */
export function fudComments(source: string, html: HtmlDocument, js: JsBatchResult): readonly FudComment[] {
  const found: FudComment[] = [...js.comments];
  const seen = new WeakSet<object>();
  const visit = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    const node = value as { readonly type?: unknown; readonly span?: Span };
    if (node.type === 'razor-comment' && node.span !== undefined) {
      found.push({ span: node.span, text: source.slice(node.span.start, node.span.end) });
      return;
    }
    if (node.type === 'style-content' && node.span !== undefined) {
      found.push(...cssComments(source, node.span.start, node.span.end));
      return;
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(html.children);
  return found.sort((a, b) => a.span.start - b.span.start);
}
