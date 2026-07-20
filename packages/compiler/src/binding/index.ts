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
