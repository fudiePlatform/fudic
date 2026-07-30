/**
 * Section completion (SDD-24 §6.6).
 *
 * After `@section ` the only valid names are the ones the layout declares with
 * `@RenderSection` (decision 84), which the workspace index already knows: the layout was
 * parsed to learn its role, so its section names came for free.
 *
 * There is no diagnostic here. SDD-24 §4.4 asks for one when a page does not fill a section
 * the layout declares, but SDD-21 §4.2 states the opposite in as many words — «it is Razor's
 * `required: false` by default» — and there is no `required` flag on a declaration to read.
 * Until that contradiction is resolved, silence is what the layout spec mandates.
 */

import type { CachedDocument } from '../document-cache.js';
import { layoutHrefOf } from '../mode.js';
import type { WorkspaceIndex } from '../workspace-index.js';

/**
 * The sections offered after `@section `.
 *
 * Sections the file already fills are NOT removed: the one being typed is usually one of them,
 * and hiding it would empty the list at the exact moment it is asked for.
 */
export function sectionCompletions(
  document: CachedDocument,
  index: WorkspaceIndex,
): readonly string[] {
  const href = layoutHrefOf(document.document);
  if (href === '') return [];

  return index.resolve(document.path, href)?.sections ?? [];
}
