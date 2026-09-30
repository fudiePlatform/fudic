/**
 * A route against the holes of its layout (SDD-48): the required sections it has to fill,
 * and what a hole the layout slots may hold.
 *
 * The rule is the compiler's (`holeContractDiagnostics`), the same function the build calls;
 * the editor only supplies the layout, from the index instead of the disk. The two cannot
 * disagree about a fact they compute with one function.
 */

import {
  holeContractDiagnostics,
  missingRequiredSections,
  type Diagnostic,
  type LayoutHoles,
  type RenderSectionNode,
} from '@fudic/compiler';
import type { CachedDocument } from '../document-cache.js';
import type { WorkspaceIndex } from '../workspace-index.js';

/** The holes of the layout this route names, or nothing for anything that is not a route. */
function layoutHolesOf(cached: CachedDocument, index: WorkspaceIndex): LayoutHoles | undefined {
  const doc = cached.document;
  if (doc.type !== 'route-document' || doc.layoutHref === '') return undefined;
  return index.resolve(cached.path, doc.layoutHref)?.holes;
}

/** Every diagnostic of the route's contract with its layout's holes. */
export function holeDiagnostics(cached: CachedDocument, index: WorkspaceIndex): readonly Diagnostic[] {
  const holes = layoutHolesOf(cached, index);
  if (holes === undefined || cached.document.type !== 'route-document') return [];
  return holeContractDiagnostics(cached.document, holes);
}

/** The required sections of the layout this route leaves unfilled, in layout order. */
export function missingSections(
  cached: CachedDocument,
  index: WorkspaceIndex,
): readonly RenderSectionNode[] {
  const holes = layoutHolesOf(cached, index);
  if (holes === undefined || cached.document.type !== 'route-document') return [];
  return missingRequiredSections(cached.document, holes);
}
