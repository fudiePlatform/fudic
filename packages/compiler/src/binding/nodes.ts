/**
 * Binding nodes (SDD-07 §3). SDD-05 produces the SYNTACTIC attribute (verbatim name +
 * ordered value parts) and leaves a content `@` as a naked `RazorExpression`. This module
 * only declares what those refine INTO; the dispatch itself lives in `classify.ts`.
 *
 * Nothing here applies semantics: HTML escaping (decision 18), the primitive-only check
 * (19), the omit-if-falsy of boolean attributes (21), `ref` inside a loop (31) and
 * `TrustedHTML` detection belong to emit / SDD-12. SDD-07 MARKS; they APPLY.
 */

import type { Node } from '../types/index.js';
import type { RazorExpression } from '../at/index.js';
import type { AttributeValuePart } from '../html/index.js';

/** A classified attribute. SDD-05 gives the raw `Attribute`; SDD-07 dispatches by name. */
export type Binding =
  | AttributeBinding
  | PropertyBinding
  | EventBinding
  | BusBinding
  | RefBinding
  | ClassBinding
  | StyleBinding;

/** The `Binding.type` discriminants, as a closed union. */
export type BindingType = Binding['type'];

/**
 * Plain attribute: static text and/or interpolation parts, treated uniformly
 * (decision 20). An empty `value` means a boolean/empty attribute (decision 44); the
 * omit-if-falsy of the standard boolean attributes (decision 21) is applied at emit.
 *
 * It is also the degraded fallback when a prefixed binding has no usable expression:
 * the raw name and parts are preserved so the editor still sees the attribute.
 */
export interface AttributeBinding extends Node {
  readonly type: 'attr';
  readonly name: string;
  readonly value: readonly AttributeValuePart[];
}

/**
 * `.prop="@x"` — exactly one expression, no concatenation, case-sensitive name
 * (decisions 23, 24, 25). `name` has no leading `.`.
 */
export interface PropertyBinding extends Node {
  readonly type: 'property';
  readonly name: string;
  readonly value: RazorExpression;
}

/**
 * `@evt="@h"` — host listener; reference or lambda; any event name including custom ones
 * (decisions 26, 27, 28). `name` is a literal string with NO leading `@`. Whether the
 * value actually evaluates to a function is runtime (decision 26). Bus subscription is
 * `BusBinding`, not this (decision 28.d).
 */
export interface EventBinding extends Node {
  readonly type: 'event';
  readonly name: string;
  readonly value: RazorExpression;
}

/**
 * `bus:evt="@h"` — bus subscriber (decisions 28.a–28.d). It listens on the page common
 * ancestor (`document`), not on the host; the handler context is still the host. Sibling
 * of Class/StyleBinding (decision 22).
 *
 * `eventName` is a literal `string` (`bus:carrito`) OR a `RazorExpression` (`bus:(expr)`,
 * the naked explicit expression after `bus:`). Static resolution to a literal and
 * matching-by-value are SDD-12 (decision 28.c); the desugaring to
 * `document.addEventListener` is emit.
 */
export interface BusBinding extends Node {
  readonly type: 'bus';
  readonly eventName: string | RazorExpression;
  readonly value: RazorExpression;
}

/** `ref="@id"` — a single simple identifier (decision 30). Loop use is rejected in SDD-12 (31). */
export interface RefBinding extends Node {
  readonly type: 'ref';
  readonly value: RazorExpression;
}

/** `class:foo="@x"` — conditional class (decision 22). */
export interface ClassBinding extends Node {
  readonly type: 'class';
  readonly className: string;
  readonly value: RazorExpression;
}

/** `style:foo="@x"` — conditional style property (decision 22). */
export interface StyleBinding extends Node {
  readonly type: 'style';
  readonly property: string;
  readonly value: RazorExpression;
}

/**
 * Content interpolation. `escaped` is true by default (decision 18) and false for `@raw`
 * (option A): SDD-05 delivers a `raw-expression` node => `escaped: false`, while a bare
 * `razor-expression` => `escaped: true`. The escaping itself is emit's.
 */
export interface Interpolation extends Node {
  readonly type: 'interpolation';
  readonly expr: RazorExpression;
  readonly escaped: boolean;
}

/** The reserved bus prefix (decision 28.a). */
export const BUS_PREFIX = 'bus:';

/** The conditional-class prefix (decision 22). */
export const CLASS_PREFIX = 'class:';

/** The conditional-style prefix (decision 22). */
export const STYLE_PREFIX = 'style:';

/** The event prefix (decisions 26–28): a host listener. */
export const EVENT_PREFIX = '@';

/** The property prefix (decisions 23–25). */
export const PROPERTY_PREFIX = '.';

/** The reserved attribute name for an element reference (decision 30). */
export const REF_NAME = 'ref';
