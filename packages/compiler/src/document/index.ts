/**
 * Document structure: validation + classification over the flat HTML tree (SDD-10).
 * Canonical re-export.
 */

export type {
  StructuredDocument,
  PageDocument,
  ComponentDocument,
  RouteDocument,
  LayoutDocument,
} from './nodes.js';
export { structureDocument, isComponentLink, isLayoutLink } from './structure.js';
