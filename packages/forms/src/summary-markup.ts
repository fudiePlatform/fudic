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
 * The markup of the summary `id` for `issues`. `links` maps a path to the id of the element that
 * binds it, and is `null` for a summary without `fields`.
 */
export function summaryMarkup(
  issues: readonly Issue[],
  id: string,
  links: Readonly<Record<string, string>> | null,
): string {
  if (issues.length === 0) return '';
  const seen = new Set<string>();
  const items = issues.map(({ path, message }) => {
    const target = links?.[path];
    // Linked, and only the first entry of a path carries the id: a group with two texts would
    // otherwise write the same id twice.
    if (target === undefined || seen.has(path)) return `<li>${text(message)}</li>`;
    seen.add(path);
    return `<li id="${attr(issueId(id, path))}"><a href="#${attr(target)}">${text(message)}</a></li>`;
  });
  return `<ul>${items.join('')}</ul>`;
}

/**
 * The markup of the summary of `node`: its own texts, or, with `fields` (`links`), its
 * `$issues()`. Tracked. What the server writes and what the client's effect repaints.
 */
export function summaryOf(
  node: AnyForm,
  id: string,
  links: Readonly<Record<string, string>> | null,
): string {
  const issues =
    links === null ? node.$messages().map((message) => ({ path: '', message })) : node.$issues();
  return summaryMarkup(issues, id, links);
}
