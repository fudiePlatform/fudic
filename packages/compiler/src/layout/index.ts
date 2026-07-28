/**
 * Layout directives (SDD-21). Canonical re-export.
 */

export type { LayoutNode, RenderDirectiveNode, RenderSectionNode, SectionNode } from './nodes.js';
export { parseDirective } from './layout.js';
export { collectDirectives, containsNode, type DirectiveSet } from './collect.js';
