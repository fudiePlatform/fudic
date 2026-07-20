/**
 * Document structure: validation + classification over the flat HTML tree (SDD-10).
 * Canonical re-export.
 */

export type { StructuredDocument, PageDocument, ComponentDocument } from './nodes.js';
export { structureDocument, isComponentLink } from './structure.js';
