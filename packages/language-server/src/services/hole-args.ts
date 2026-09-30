/**
 * Completion inside the parentheses of a layout's hole (SDD-48).
 *
 *     @RenderBody(|)                  →  slot: "contenido", slot: "pie", …
 *     @RenderSection(nav, |)          →  required: true, slot: "cabecera", …
 *     @RenderSection(nav, slot: "|")  →  cabecera, lateral, …
 *
 * The slots are those of the component AROUND the hole, read from its contract in the index —
 * the same list a `slot=` of a child offers. Each one comes as a whole argument, so the author
 * picks the slot and never types the key.
 *
 * Read off the TEXT, not the tree: the position is being typed, `@RenderSection(nav, ` does
 * not parse into its arguments yet, and the answer is wanted exactly then.
 */

import { documentRoots, linkHref, span, walk, type Span } from '@fudic/compiler';
import type { CachedDocument } from '../document-cache.js';
import type { WorkspaceIndex } from '../workspace-index.js';

/** Where the caret is inside a hole's parentheses, and what it may write there. */
export type HoleArgumentContext =
  | {
      readonly kind: 'key';
      /** The word under the caret, replaced by the item. */
      readonly span: Span;
      /** The keys this directive takes and has not written yet, in their order. */
      readonly keys: readonly ('required' | 'slot')[];
    }
  | {
      readonly kind: 'slot';
      /** The inside of the quotes, up to the caret and the name that follows it. */
      readonly span: Span;
    };

const OPENING = /@(RenderBody|RenderSection)\s*\(/gu;

/** The hole-argument context at `offset`, or nothing. */
export function holeArgumentContextAt(source: string, offset: number): HoleArgumentContext | undefined {
  let open: { directive: string; at: number } | undefined;
  for (const match of source.slice(0, offset).matchAll(OPENING)) {
    open = { directive: match[1] as string, at: (match.index ?? 0) + match[0].length };
  }
  if (open === undefined) return undefined;
  const typed = source.slice(open.at, offset);
  if (typed.includes(')')) return undefined;

  const slotValue = /\bslot\s*:\s*["']([^"'\n]*)$/u.exec(typed);
  if (slotValue !== null) {
    const start = offset - (slotValue[1] as string).length;
    const rest = /^[^"'\n)]*/u.exec(source.slice(offset)) as RegExpExecArray;
    return { kind: 'slot', span: span(start, offset + rest[0].length) };
  }

  // A section's name comes first: until its comma, the caret is on the name.
  const section = open.directive === 'RenderSection';
  if (section && !typed.includes(',')) return undefined;
  // Only where an argument begins: right after `(` or `,`, with at most a word typed.
  const word = /(^|,)\s*([A-Za-z]*)$/u.exec(typed);
  if (word === null) return undefined;

  const close = source.indexOf(')', offset);
  const whole = source.slice(open.at, close === -1 ? source.length : close);
  const written = new Set([...whole.matchAll(/\b(required|slot)\s*:/gu)].map((m) => m[1]));
  const taken: readonly ('required' | 'slot')[] = section ? ['required', 'slot'] : ['slot'];
  const typedWord = word[2] as string;
  return {
    kind: 'key',
    span: span(offset - typedWord.length, offset),
    keys: taken.filter((k) => !written.has(k)),
  };
}

/**
 * The slots of the component around `offset`: the nearest enclosing element that is a
 * component, and the slots its contract declares. Empty when there is none, or when the
 * index does not know it.
 */
export function slotsAround(cached: CachedDocument, index: WorkspaceIndex, offset: number): readonly string[] {
  let host: string | undefined;
  walk(documentRoots(cached.document), {
    element(el) {
      const close = el.closeSpan;
      if (close === undefined || !el.name.includes('-')) return;
      // Parents come before children, so the last one that contains the caret is the nearest.
      if (offset >= el.openSpan.end && offset <= close.start) host = el.name;
    },
  });
  if (host === undefined) return [];
  for (const link of cached.document.links) {
    const href = linkHref(link);
    const entry = href === undefined ? undefined : index.resolve(cached.path, href);
    if (entry?.tag === host) return entry.contract.slots;
  }
  return [];
}
