/**
 * Emit (SDD-15). Canonical re-export: the component dependency graph and the module
 * emitters that turn it into one `.mjs` per component plus one for the page.
 */

export { CodeWriter } from './writer.js';
export type { Anchor, EmitMapping, MappedPart, LinePart } from './writer.js';
export {
  AssetLinker,
  type AssetExists,
  type AssetText,
  type AssetUrl,
  type AssetOrigin,
} from './assets.js';
export { inlineRuntimeMarker, RUNTIME_MARKER, INLINE_QUERY, asksInline } from './parts.js';
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
  bridgeIds,
  isReactiveRoute,
  routeHydration,
} from './level.js';
// Whether a page has anything to hydrate, and therefore whether it gets a runtime tag at all.
// Exported because SDD-45 §4.4 makes the BUILD ask it too — a page that does not hydrate has
// no coordinator, so the file has to not be emitted as well as not be linked. Two predicates
// that agree today is a page whose head and whose output stop agreeing the day one of them
// learns something.
export { needsRuntime } from './maps.js';
export {
  emitComponentIocModule,
  hasDependencyInjection,
  iocName,
  ownsContainer,
  usesDependencyInjection,
  IOC_SUFFIX,
} from './di.js';

// The `control` bindings of a template and their `error` markers, resolved once for both
// branches (SDD-34 §4.3, BUG-41 §4.3).
export { planControls, slotIdOf, issueIdOf, EMPTY_CONTROLS } from './controls.js';
export type { ControlPlan, ControlSite, MarkerSite } from './controls.js';

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

// What each style scope of a page can match (SDD-49 §3.3).
export {
  documentSurface,
  shadowSurface,
  unionSurfaces,
  frameworkAttributesOf,
  type ScopeSurface,
  type StyleScope,
} from './surface.js';
export {
  prunePage,
  FUD_SHEET_IMPORT,
  FUD_SHEET_UNREADABLE,
  FUD_SHEET_UNUSED,
  type PageSheet,
  type PrunedSheet,
} from './prune.js';
