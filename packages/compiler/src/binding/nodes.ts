/**
 * Binding nodes (SDD-07 §3). SDD-05 produces the SYNTACTIC attribute (verbatim name +
 * ordered value parts) and leaves a content `@` as a naked `RazorExpression`. This module
 * only declares what those refine INTO; the dispatch itself lives in `classify.ts`.
 *
 * Nothing here applies semantics: HTML escaping (decision 18), the primitive-only check
 * (19), the omit-if-falsy of boolean attributes (21), `ref` inside a loop (31) and
 * `TrustedHTML` detection belong to emit / SDD-12. SDD-07 MARKS; they APPLY.
 */

import type { Node, Span } from '../types/index.js';
import type { RazorExpression } from '../at/index.js';
import type { AttributeValuePart } from '../html/index.js';

/** A classified attribute. SDD-05 gives the raw `Attribute`; SDD-07 dispatches by name. */
export type Binding =
  | AttributeBinding
  | PropertyBinding
  | EventBinding
  | BusBinding
  | RefBinding
  | ControlBinding
  | ClassBinding
  | StyleBinding
  | DelegateBinding;

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
 * `.prop="…"` — the ONE way to pass a property, case-sensitive name (decisions 23, 25).
 * `name` has no leading `.`.
 *
 * The value is shaped exactly like an attribute's, and that is BUG-16: since the dot is the
 * only way to write a prop, it has to accept everything a prop can be — a constant
 * (`.tone="info"`), a single expression (`.tone="@(t)"`) or nothing at all (`.disabled`,
 * which is `true` by decision 44). Decision 23 required the value to be a lone `@`, which
 * left a constant with no way to be written at all once the plain attribute stopped being
 * one; `FUD0090` retires with it.
 *
 * What stays rejected is CONCATENATION (decision 24, `FUD0091`): a property carries a value,
 * not a string assembled from pieces.
 */
export interface PropertyBinding extends Node {
  readonly type: 'property';
  readonly name: string;
  readonly value: readonly AttributeValuePart[];
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

/**
 * `control="@f.title"` — the form node this element is bound to (decision 108, SDD-34 §4.1).
 *
 * A RESERVED ATTRIBUTE and not a prefix, which is the whole of why it sits beside `RefBinding`
 * and not beside `ClassBinding`: `class:`/`bus:` carry a name after the `:` and here there is
 * nothing to name — the node is what the expression says.
 *
 * Unlike `ref` the value is NOT limited to a simple identifier: `@f.seo.canonical` is a path
 * and that is its ordinary case. Whether the path exists, and whether its type is the one the
 * element expects, is checked by TypeScript over the SDD-23 projection and never here (§4.9).
 *
 * What the ELEMENT makes of it (decision 109) — a form, a value-bearing control, a group, or a
 * reference crossing to a component — is not decided here either: this node only records that
 * the author wrote the binding and which expression they wrote.
 */
export interface ControlBinding extends Node {
  readonly type: 'control';
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
 * `delegate:day` — the delegation marker (decision 117, SDD-37 §3.1). A prefix like
 * `class:`/`style:`/`bus:` (decision 22) and, unlike all three, one that carries NO value:
 * the element is not being given anything, it is handing its row identity upwards.
 *
 * `name` is a binding declared by the header of the loop this element sits in, and the
 * ancestor that reads it writes `$name` in a handler argument list. Which loop, whether the
 * name exists there and whether anybody reads it are five of SDD-37's eight diagnostics, and
 * all five are semantic: this node only records the marker and where its name is written.
 *
 * `nameSpan` is the name AFTER the colon, kept apart from `span` because they are blamed by
 * different diagnostics — `FUD0662` points at the name, `FUD0661` and `FUD0663` at the whole
 * attribute.
 */
export interface DelegateBinding extends Node {
  readonly type: 'delegate';
  readonly name: string;
  readonly nameSpan: Span;
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

/** The delegation-marker prefix (decision 117). */
export const DELEGATE_PREFIX = 'delegate:';

/** The event prefix (decisions 26–28): a host listener. */
export const EVENT_PREFIX = '@';

/** The property prefix (decisions 23–25). */
export const PROPERTY_PREFIX = '.';

/** The reserved attribute name for an element reference (decision 30). */
export const REF_NAME = 'ref';

/** The reserved attribute name for a form binding (decision 108). */
export const CONTROL_NAME = 'control';
