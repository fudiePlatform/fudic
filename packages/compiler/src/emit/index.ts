/**
 * Emit (SDD-15). Canonical re-export: the component dependency graph and the module
 * emitters that turn it into one `.mjs` per component plus one for the page.
 */

export { CodeWriter } from './writer.js';
export type { EmitMapping, MappedPart, LinePart } from './writer.js';
export { AssetLinker, type AssetExists } from './assets.js';
export {
  resolveComponents,
  resolveDocument,
  linkHref,
  entryComponent,
  allComponents,
  componentOf,
} from './resolve.js';
export type {
  ResolveIo,
  ResolvedComponent,
  ComponentGraph,
  ResolvedLayout,
  DocumentGraph,
} from './resolve.js';
export {
  emitComponentModule,
  emitComponentModuleMapped,
  emitPageModule,
  emitPageModuleMapped,
  type ComponentSpecifier,
  type LayoutSpecifier,
  type EmitOptions,
  type EmitOutput,
} from './module.js';
export {
  emitComponentClientModule,
  emitComponentClientModuleMapped,
} from './client.js';
export {
  emitLayoutModule,
  emitLayoutModuleMapped,
  emitRouteModule,
  emitRouteModuleMapped,
} from './layout.js';

export { hydratableTags, isIntrinsicallyHydratable } from './level.js';
export {
  emitComponentIocModule,
  hasDependencyInjection,
  iocName,
  ownsContainer,
  usesDependencyInjection,
  IOC_SUFFIX,
} from './di.js';

// The contract questions only a resolved graph can answer, and the three diagnostics that
// need them (BUG-23 §4.4).
export { graphRegistry, contractDiagnostics } from './registry.js';

// The `@code` reading itself, for a caller that holds ONE document and no graph — the
// workspace index, which needs a child's props to expand its tag (BUG-23 task 25).
export { extractCode, type Prop } from './oxc-code.js';

export { spaceModeOf, collapseSpace, nestedSpaceMode, SPACE_ATTR, type SpaceMode } from './space.js';
