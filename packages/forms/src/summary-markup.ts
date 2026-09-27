/**
 * The markup of a summary — the ONE function that writes it (BUG-42 §4.6).
 *
 * The server paints a summary into the HTML it renders and the client repaints it as the form
 * changes. If those were two functions, the first message with a character escaped differently
 * would break the byte-for-byte equality of SSR and hydration (SDD-34 §6.10). So this lives in
 * the MODEL, touches no DOM, and both ends call it.
 *
 * - Nothing to say: `''`. The element is left with no children, so `:empty` still hides it.
 * - Something to say: always a list, even with one entry, so a screen reader announces it as a
 *   list and the shape of the markup does not depend on how many there are.
 * - With `fields` (a `links` map), an entry whose path the map knows is a link to its field, and
 *   its `<li>` carries the id the field's `aria-describedby` points at (`issueId`).
 */

import type { AnyForm, Issue } from './types.js';

/** A no-break space, which the HTML serialisation writes as an entity. */
const NBSP = new RegExp(String.fromCharCode(0xa0), 'gu');

/** Text, escaped as the HTML serialisation escapes it, so the DOM reads back the same bytes. */
const text = (s: string): string =>
  s.replaceAll('&', '&amp;').replace(NBSP, '&nbsp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** An attribute value, escaped the same way. */
const attr = (s: string): string =>
  s.replaceAll('&', '&amp;').replace(NBSP, '&nbsp;').replaceAll('"', '&quot;');

/**
 * The id of a field's entry in the summary `summary`: the summary's id and the path, with the
 * dots of a nested path turned into dashes. The compiler derives the same one for the field's
 * `aria-describedby`.
 */
export const issueId = (summary: string, path: string): string =>
  `${summary}-${path.replaceAll('.', '-')}`;

/**
 * One `<li>` of a summary. A linked one carries the id of its entry and the `href` of its field;
 * a plain one, only its text.
 */
export type SummaryEntry =
  | { readonly text: string }
  | { readonly text: string; readonly id: string; readonly href: string };

/**
 * The entries of the summary `id` for `issues`. `links` maps a path to the id of the element
 * that binds it, and is `null` for a summary without `fields`. What the server builds its nodes
 * from and what `summaryMarkup` writes: the one decision about the list, taken once.
 */
export function summaryEntries(
  issues: readonly Issue[],
  id: string,
  links: Readonly<Record<string, string>> | null,
): SummaryEntry[] {
  const seen = new Set<string>();
  return issues.map(({ path, message }) => {
    const target = links?.[path];
    // Linked, and only the first entry of a path carries the id: a group with two texts would
    // otherwise write the same id twice.
    if (target === undefined || seen.has(path)) return { text: message };
    seen.add(path);
    return { text: message, id: issueId(id, path), href: `#${target}` };
  });
}

/** The markup of the summary `id` for `issues`: `''` with nothing to say, a list otherwise. */
export function summaryMarkup(
  issues: readonly Issue[],
  id: string,
  links: Readonly<Record<string, string>> | null,
): string {
  if (issues.length === 0) return '';
  const items = summaryEntries(issues, id, links).map((entry) =>
    'href' in entry
      ? `<li id="${attr(entry.id)}"><a href="${attr(entry.href)}">${text(entry.text)}</a></li>`
      : `<li>${text(entry.text)}</li>`,
  );
  return `<ul>${items.join('')}</ul>`;
}

/** What `node` has to say in a summary: its own texts, or, with `fields` (`links`), its `$issues()`. */
const issuesOf = (node: AnyForm, links: Readonly<Record<string, string>> | null): readonly Issue[] =>
  links === null ? node.$messages().map((message) => ({ path: '', message })) : node.$issues();

/** The entries of the summary of `node`. Tracked. What the server builds its list from. */
export function summaryEntriesOf(
  node: AnyForm,
  id: string,
  links: Readonly<Record<string, string>> | null,
): SummaryEntry[] {
  return summaryEntries(issuesOf(node, links), id, links);
}

/** The markup of the summary of `node`. Tracked. What the client's effect repaints. */
export function summaryOf(
  node: AnyForm,
  id: string,
  links: Readonly<Record<string, string>> | null,
): string {
  return summaryMarkup(issuesOf(node, links), id, links);
}
