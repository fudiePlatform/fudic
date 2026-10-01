/**
 * A route against the holes of its layout (SDD-48): the required sections it has to fill,
 * and what a hole the layout slots may hold.
 *
 * The rule is the compiler's (`holeContractDiagnostics`), the same function the build calls;
 * the editor and the typecheck only supply the layout, from an index instead of the disk. The two cannot
 * disagree about a fact they compute with one function.
 */

import {
  holeContractDiagnostics,
  missingRequiredSections,
  type Diagnostic,
  type LayoutHoles,
  type RenderSectionNode,
  type RouteDocument,
} from '@fudic/compiler';
import type { LinkIndex } from './link-index.js';
import type { ProjectedFud } from './project.js';

/** The route and the holes of the layout it names, or nothing for anything that is not one. */
function contractOf(
  cached: ProjectedFud,
  index: LinkIndex,
): { readonly route: RouteDocument; readonly holes: LayoutHoles } | undefined {
  const route = cached.document;
  if (route.type !== 'route-document' || route.layoutHref === '') return undefined;
  const holes = index.resolve(cached.path, route.layoutHref)?.holes;
  return holes === undefined ? undefined : { route, holes };
}

/** Every diagnostic of the route's contract with its layout's holes. */
export function holeDiagnostics(cached: ProjectedFud, index: LinkIndex): readonly Diagnostic[] {
  const contract = contractOf(cached, index);
  return contract === undefined ? [] : holeContractDiagnostics(contract.route, contract.holes);
}

/** The required sections of the layout this route leaves unfilled, in layout order. */
export function missingSections(
  cached: ProjectedFud,
  index: LinkIndex,
): readonly RenderSectionNode[] {
  const contract = contractOf(cached, index);
  return contract === undefined ? [] : missingRequiredSections(contract.route, contract.holes);
}
