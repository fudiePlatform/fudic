/**
 * Section completion (SDD-24 §6.6).
 *
 * After `@section ` the only valid names are the ones the layout declares with
 * `@RenderSection` (decision 84), which the workspace index already knows: the layout was
 * parsed to learn its role, so its section names came for free.
 *
 * There is no diagnostic here. A section is optional unless the layout says
 * `required: true`, and that one — `FUD0440` — is `holes.ts`'s (SDD-48).
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
