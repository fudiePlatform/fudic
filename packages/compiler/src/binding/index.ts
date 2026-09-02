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
  ClassBinding,
  StyleBinding,
  Interpolation,
} from './nodes.js';
export {
  BUS_PREFIX,
  CLASS_PREFIX,
  STYLE_PREFIX,
  EVENT_PREFIX,
  PROPERTY_PREFIX,
  REF_NAME,
} from './nodes.js';

export { classifyAttribute, interpolate } from './classify.js';

// The two binding RULES the emit and the editor must decide with the same function
// (BUG-23 §5): the shape of a handler, and the form a value crosses with.
export type { HandlerShape } from './handler.js';
export { handlerShape, unwrapParens } from './handler.js';
export type { Crossing, ComponentDeclaredProps } from './crossing.js';
export { crossing, reactiveNames } from './crossing.js';
