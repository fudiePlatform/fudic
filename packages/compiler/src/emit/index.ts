/**
 * Emit (SDD-15). Canonical re-export: the component dependency graph and the module
 * emitters that turn it into one `.mjs` per component plus one for the page.
 */

export { CodeWriter } from './writer.js';
export type { Anchor, EmitMapping, MappedPart, LinePart } from './writer.js';
export { AssetLinker, type AssetExists, type AssetUrl, type AssetOrigin } from './assets.js';
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
  type ProjectStyle,
} from './module.js';
export {
  lintProjectStyle,
  FUD_DOCUMENT_ONLY_SELECTOR,
} from './styles-lint.js';
export { compactProjectCss } from './project-styles.js';
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

export {
  emitRouteClientModule,
  emitRouteClientModuleMapped,
} from './route-client.js';

export {
  hydratableTags,
  isIntrinsicallyHydratable,
  formAssociatedTags,
  isReactiveRoute,
  routeHydration,
} from './level.js';
export {
  emitComponentIocModule,
  hasDependencyInjection,
  iocName,
  ownsContainer,
  usesDependencyInjection,
  IOC_SUFFIX,
} from './di.js';

// The `control` bindings of a template, resolved once for both branches (SDD-34 §4.3).
export { planControls, slotIdOf, ERROR_SLOT_ATTR, SUMMARY_SLOT_ATTR } from './controls.js';
export type { ControlPlan, ControlSite } from './controls.js';

// The contract questions only a resolved graph can answer, and the three diagnostics that
// need them (BUG-23 §4.4).
export { graphRegistry, contractDiagnostics } from './registry.js';
export { injectionDiagnostics } from './di-diagnostics.js';

// The `@code` reading itself, for a caller that holds ONE document and no graph — the
// workspace index, which needs a child's props to expand its tag (BUG-23 task 25).
export { extractCode, type Prop } from './oxc-code.js';
/**
 * The scope analysis of SDD-30 §3.3, public since SDD-29 §4.11: the projection needs the same
 * reading of "a name this markup consumes and does not declare" the emit uses, and a second
 * one would drift from it in exactly the cases that are hard to see.
 */
export { freeReferences, freeReferenceNodes, type FragmentAst } from './scope.js';
/**
 * The walk that says which JS a run of markup holds (SDD-30 §3.3), public for the same
 * reason: the projection asks the batch for the AST of a span, and only this walk knows
 * which spans were registered. A second enumeration would ask for a fragment nobody parsed.
 */
export { collectTemplateJs, type JsFragmentVisitor } from './constructs.js';

export { spaceModeOf, collapseSpace, nestedSpaceMode, SPACE_ATTR, type SpaceMode } from './space.js';
