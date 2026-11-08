/**
 * The semantic analysis pass (SDD-12): context-dependent rules the parser could not decide
 * locally — uniqueness, nesting, cross-references, evident type errors. Canonical re-export.
 */

export type {
  SemanticInput,
  ComponentRegistry,
  SemanticModel,
  Analyzer,
  SemanticResult,
  MarkupInput,
  ProjectModule,
  Report,
} from './model.js';
export { ANALYZERS, analyze } from './analyze.js';
export { walk, documentRoots, documentCode, type TreeVisitor } from './walk.js';
export {
  portableRegions,
  type PortablePlace,
  type PortableRegions,
  type PortableRoot,
} from './portable-regions.js';
export { VALUE_ARGUMENT } from './value-argument.js';
export { HTML_EVENT_ATTRIBUTES, isNativeEventAttribute } from './html-events.js';
export {
  eventsReadingRow,
  planDelegation,
  handlerAt,
  type HandlerFacts,
  EVENT_ARGUMENT,
  valueMentions,
  type DelegationJs,
  type DelegationMark,
  type DelegationPlan,
  type DelegationRead,
} from './delegation.js';
