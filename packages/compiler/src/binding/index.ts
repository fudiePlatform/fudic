/**
 * Interpolation and bindings (SDD-07). Canonical re-export.
 */

export type {
  Binding,
  BindingType,
  AttributeBinding,
  PropertyBinding,
  EventBinding,
  BusBinding,
  RefBinding,
  ControlBinding,
  ErrorBinding,
  MarkerName,
  ClassBinding,
  StyleBinding,
  DelegateBinding,
  Interpolation,
} from './nodes.js';
export {
  BUS_PREFIX,
  CLASS_PREFIX,
  STYLE_PREFIX,
  DELEGATE_PREFIX,
  EVENT_PREFIX,
  PROPERTY_PREFIX,
  REF_NAME,
  CONTROL_NAME,
  ERROR_NAME,
  SUMMARY_NAME,
  FIELDS_NAME,
} from './nodes.js';

export { classifyAttribute, interpolate } from './classify.js';

// The two binding RULES the emit and the editor must decide with the same function
// (BUG-23 §5): the shape of a handler, and the form a value crosses with.
export type { HandlerShape } from './handler.js';
export { handlerShape, unwrapParens } from './handler.js';
export type { Crossing, ComponentDeclaredProps } from './crossing.js';
export { crossing, reactiveNames } from './crossing.js';

// What a `control` binding means on ITS element (decision 109) — the third rule of this kind:
// the semantic pass reports `FUD0592` off it and the emit picks its bind module off it.
export type { ControlTarget, BindFunction, UnsupportedControl } from './control.js';
// Which element speaks for which bound node (decision 130): paired ONCE, for the analyzer that
// reports what cannot be paired and the emit that writes the pairs.
export type { Marker, MarkerKind, MarkerPairing, MarkerProblem } from './markers.js';
export type { BlockVisitor } from './markers.js';
export { pairMarkers, hasFields, isSummaryFields, staticId, walkBlocks } from './markers.js';
// The bridge of a control-component (decision 132): its field and the id the bridge points at,
// for the emit that writes it and the analyzer that reports what cannot be bridged.
export type { Bridge, BridgeProblem, BridgeResult } from './bridge.js';
export { bridgeOf, DERIVED_FIELD_ID, REFERENCE_TARGET_ATTR } from './bridge.js';

export {
  controlTarget,
  isRadio,
  isFormAssociated,
  FORM_ASSOCIATED_ATTR,
  CONTROL_PROP,
} from './control.js';
