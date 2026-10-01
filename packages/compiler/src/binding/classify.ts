/**
 * Attribute classification and content interpolation (SDD-07 §4, §5).
 *
 * A pure refinement pass over the SDD-05 tree: it re-reads the verbatim attribute name,
 * decides which binding it denotes (decision 29) and validates only the STRUCTURAL rules
 * SDD-07 owns — "the value is exactly one `@`", "no concatenation", "`ref` is a simple
 * identifier". It never re-lexes, never parses JS and never throws.
 *
 * `source` is required because two of the rules are about the TEXT, not the tree: the
 * simple-identifier check of `ref` (decision 30) can only be answered by reading the
 * expression's characters, and the `bus:` prefix of the `bus:(expr)` form (decision 28.b)
 * lives in the source between the attribute start and the expression name's start — the
 * SDD-05 `Attribute` keeps only the `RazorExpression` for it. See SDD-07 §3.3.
 */

import { type Diagnostic, type ParseResult, ok, withDiagnostics } from '../types/index.js';
import { type Span, span } from '../types/index.js';
import {
  FUD0091,
  FUD0092,
  FUD0093,
  FUD0094,
  FUD0095,
  FUD0096,
  FUD0097,
  FUD0098,
  FUD0099,
  FUD0590,
  FUD0596,
  FUD0667,
} from '@fudic/diagnostics';
import type { RazorExpression } from '../at/index.js';
import type { Attribute, AttributeValuePart } from '../html/index.js';
import {
  type Binding,
  type Interpolation,
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
  type MarkerName,
} from './nodes.js';

// ---------------------------------------------------------------------------
// Diagnostic codes — SDD-07 owns FUD0090..FUD0109 (§6)
// ---------------------------------------------------------------------------

// FUD0090 (property value must be a lone `@`) is RETIRED by BUG-16: the dot is the only way
// to write a prop, so a constant has to be one of the things it accepts. The code stays
// reserved in SDD-07's range and is emitted by nobody.
//
// SDD-34 §5 owns `FUD0590`–`FUD0619`, and the first of them (`FUD0590`) is decided HERE
// because it is a rule about the FORM of the value — the same layer that already answers it
// for `ref` and for `class:`. `error=` is `control=`'s mirror (decision 130), and its value is
// wrong the same way (`FUD0596`).
//
// SDD-37 §5 owns `FUD0660`–`FUD0679`, and `FUD0667` is the only one of the eight decided HERE:
// a marker that takes a value is wrong by its FORM, the same layer that answers "a `class:`
// needs an expression". The other seven need the loop header and the ancestor's handler, and
// those are SDD-12's analyzers.

/** A JS identifier, the only shape `ref="@id"` accepts (decision 30). */
const SIMPLE_IDENTIFIER = /^[\p{ID_Start}$_][\p{ID_Continue}$]*$/u;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify one raw attribute into its binding kind (SDD-07 §4). Validates the structural
 * rules SDD-07 owns (single `@` value, no concatenation, simple `ref` identifier) and
 * degrades — never throws — when they are broken.
 *
 * `source` is the original .fud text the `Attribute` spans point into.
 */
export function classifyAttribute(attr: Attribute, source: string): ParseResult<Binding> {
  const name = attr.name;

  // `bus:(EVENTOS.carrito)="@h"` (decision 28.b). SDD-05 replaces the whole name with the
  // expression, so the reserved prefix must be recovered from the source text.
  if (typeof name !== 'string') return classifyExpressionName(attr, name, source);

  if (name.startsWith(BUS_PREFIX)) {
    return classifyBusLiteral(attr, name.slice(BUS_PREFIX.length));
  }
  if (name.startsWith(EVENT_PREFIX)) {
    return classifyEvent(attr, name.slice(EVENT_PREFIX.length));
  }
  if (name.startsWith(PROPERTY_PREFIX)) {
    return classifyProperty(attr, name.slice(PROPERTY_PREFIX.length));
  }
  if (name.startsWith(CLASS_PREFIX)) {
    return classifyClass(attr, name.slice(CLASS_PREFIX.length));
  }
  if (name.startsWith(STYLE_PREFIX)) {
    return classifyStyle(attr, name.slice(STYLE_PREFIX.length));
  }
  if (name.startsWith(DELEGATE_PREFIX)) {
    return classifyDelegate(attr, name.slice(DELEGATE_PREFIX.length));
  }
  if (name === REF_NAME) return classifyRef(attr, source);
  if (name === CONTROL_NAME) return classifyControl(attr);
  if (name === ERROR_NAME || name === SUMMARY_NAME) return classifyError(attr, name);

  return ok(plainAttribute(attr, name));
}

/**
 * Wrap a content `RazorExpression` as an interpolation (SDD-07 §5). `escaped` is true for
 * a plain `@expr` and false for `@raw( ... )`; the caller derives it from the SDD-05
 * content node kind (`razor-expression` vs `raw-expression`).
 */
export function interpolate(expr: RazorExpression, escaped: boolean): Interpolation {
  return { type: 'interpolation', span: expr.span, expr, escaped };
}

// ---------------------------------------------------------------------------
// Per-kind classifiers
// ---------------------------------------------------------------------------

function classifyExpressionName(
  attr: Attribute,
  name: RazorExpression,
  source: string,
): ParseResult<Binding> {
  const prefixSpan = span(attr.span.start, name.span.start);
  const prefix = source.slice(prefixSpan.start, prefixSpan.end);

  // Only `bus:` may be followed by an expression name (decision 28.b). The SDD-05 lexer
  // accepts ANY `name:` before the `(`, so the check belongs to this dispatch layer.
  if (prefix !== BUS_PREFIX) {
    return degrade(plainAttribute(attr, prefix), FUD0098({ span: prefixSpan, prefix }));
  }

  const handler = requireSingleExpression(attr);
  if (handler.expr === null) {
    return degrade(plainAttribute(attr, prefix), busHandlerDiag(valueSpan(attr)));
  }
  const binding: Binding = {
    type: 'bus',
    span: attr.span,
    eventName: name,
    value: handler.expr,
  };
  return handler.reason === null
    ? ok(binding)
    : degrade(binding, busHandlerDiag(valueSpan(attr)));
}

function classifyBusLiteral(attr: Attribute, eventName: string): ParseResult<Binding> {
  const diagnostics: Diagnostic[] = [];

  // `bus:="@h"` — the prefix is there but names nothing (FUD0097).
  if (eventName.length === 0) {
    diagnostics.push(FUD0097({ span: nameSpan(attr, BUS_PREFIX + eventName) }));
  }

  const handler = requireSingleExpression(attr);
  if (handler.reason !== null) diagnostics.push(busHandlerDiag(valueSpan(attr)));
  if (handler.expr === null) {
    return withDiagnostics(plainAttribute(attr, BUS_PREFIX + eventName), diagnostics);
  }
  return withDiagnostics(
    { type: 'bus', span: attr.span, eventName, value: handler.expr },
    diagnostics,
  );
}

function classifyEvent(attr: Attribute, eventName: string): ParseResult<Binding> {
  const diagnostics: Diagnostic[] = [];

  if (eventName.length === 0) {
    diagnostics.push(FUD0099({ span: nameSpan(attr, EVENT_PREFIX + eventName), binding: 'event' }));
  }

  const handler = requireSingleExpression(attr);
  if (handler.reason !== null) diagnostics.push(FUD0092({ span: valueSpan(attr) }));
  if (handler.expr === null) {
    return withDiagnostics(plainAttribute(attr, EVENT_PREFIX + eventName), diagnostics);
  }
  return withDiagnostics(
    { type: 'event', span: attr.span, name: eventName, value: handler.expr },
    diagnostics,
  );
}

/**
 * `.prop="…"` — the only way to pass a property (BUG-16 §3.1).
 *
 * Being the only way is what widens the value: a constant, a lone `@` and a bare name are
 * all legitimate things to hand a component, so the value is taken as it comes, exactly
 * like an attribute's. `FUD0090` — decision 23's "the value must be a lone `@`" — retires
 * here, because it forbade the very form the plain attribute used to cover.
 */
function classifyProperty(attr: Attribute, propertyName: string): ParseResult<Binding> {
  const diagnostics: Diagnostic[] = [];

  if (propertyName.length === 0) {
    diagnostics.push(
      FUD0099({ span: nameSpan(attr, PROPERTY_PREFIX + propertyName), binding: 'property' }),
    );
  }

  if (attr.value.length > 1) {
    // Decision 24: a property carries a VALUE, not a string built by concatenation. The
    // binding survives it — degrading to a plain attribute named `.prop` would hide the
    // prop from the editor over a mistake in its value.
    diagnostics.push(FUD0091({ span: valueSpan(attr) }));
  }

  return withDiagnostics(
    { type: 'property', span: attr.span, name: propertyName, value: attr.value },
    diagnostics,
  );
}

function classifyClass(attr: Attribute, className: string): ParseResult<Binding> {
  const diagnostics = conditionalNameDiagnostics(attr, className, 'class');
  const handler = requireSingleExpression(attr);
  if (handler.reason !== null) diagnostics.push(conditionalValueDiag(attr, 'class'));
  if (handler.expr === null) {
    return withDiagnostics(plainAttribute(attr, CLASS_PREFIX + className), diagnostics);
  }
  return withDiagnostics(
    { type: 'class', span: attr.span, className, value: handler.expr },
    diagnostics,
  );
}

function classifyStyle(attr: Attribute, property: string): ParseResult<Binding> {
  const diagnostics = conditionalNameDiagnostics(attr, property, 'style');
  const handler = requireSingleExpression(attr);
  if (handler.reason !== null) diagnostics.push(conditionalValueDiag(attr, 'style'));
  if (handler.expr === null) {
    return withDiagnostics(plainAttribute(attr, STYLE_PREFIX + property), diagnostics);
  }
  return withDiagnostics(
    { type: 'style', span: attr.span, property, value: handler.expr },
    diagnostics,
  );
}

/**
 * `delegate:day` (decision 117). Two structural rules, and both are about what the marker is
 * NOT: it names something — `delegate:` alone falls into the `FUD0099` every prefix shares —
 * and it carries nothing, because the element is not being given a value, it is handing its
 * row identity to an ancestor (§3.1).
 *
 * A marker written with a value keeps its binding and drops the value: hiding the marker from
 * the editor over a mistake in a value it never wanted is the reading BUG-16 settled for
 * `.prop`, and here the value is not even part of the node.
 */
function classifyDelegate(attr: Attribute, name: string): ParseResult<Binding> {
  const diagnostics: Diagnostic[] = [];

  if (name.length === 0) {
    diagnostics.push(FUD0099({ span: nameSpan(attr, DELEGATE_PREFIX + name), binding: 'delegate' }));
  }

  if (attr.value.length > 0) diagnostics.push(FUD0667({ span: valueSpan(attr), name }));

  // The name is the tail of the attribute NAME, and the attribute always spans at least its
  // own name, so neither end needs clamping the way `nameSpan` does for a prefix it is handed.
  const start = attr.span.start + DELEGATE_PREFIX.length;
  return withDiagnostics(
    { type: 'delegate', span: attr.span, name, nameSpan: span(start, start + name.length) },
    diagnostics,
  );
}

function classifyRef(attr: Attribute, source: string): ParseResult<Binding> {
  const handler = requireSingleExpression(attr);
  if (handler.expr === null) {
    return degrade(plainAttribute(attr, REF_NAME), refDiag(valueSpan(attr)));
  }

  const binding: Binding = { type: 'ref', span: attr.span, value: handler.expr };
  // Decision 30: an implicit expression whose text is ONE identifier. `@(x)` is explicit
  // and `@a.b` is a path — both rejected, and the RefBinding is kept for the editor.
  const text = source.slice(handler.expr.expr.start, handler.expr.expr.end);
  const simple = handler.expr.kind === 'implicit' && SIMPLE_IDENTIFIER.test(text);
  return simple && handler.reason === null
    ? ok(binding)
    : degrade(binding, refDiag(handler.expr.span));
}

/**
 * `control="@f.title"` (decision 108). The one structural rule is the one `ref` already has:
 * the value is EXACTLY one `@` expression.
 *
 * And the one `ref` has that this does NOT: the simple-identifier check. A form node is
 * addressed by a path — `@f.seo.canonical` is the ordinary case, not the exotic one — so
 * narrowing the value to an identifier would leave every nested field unwritable. Which path
 * is legal is a question about a schema, and the schema has types: TypeScript answers it over
 * the SDD-23 projection (§4.9).
 *
 * `control="title"` — the prototype's spelling, with no `@` — is exactly the shape this
 * rejects, and the message says what to write instead: the diagnostic IS the migration.
 */
function classifyControl(attr: Attribute): ParseResult<Binding> {
  const handler = requireSingleExpression(attr);
  if (handler.expr === null) {
    return degrade(plainAttribute(attr, CONTROL_NAME), controlDiag(valueSpan(attr)));
  }
  const binding: Binding = { type: 'control', span: attr.span, value: handler.expr };
  // A concatenation keeps the binding — a form node hidden from the editor over a mistake in
  // its value helps nobody, which is the reading BUG-16 already settled for `.prop`.
  return handler.reason === null ? ok(binding) : degrade(binding, controlDiag(valueSpan(attr)));
}

/**
 * `error="@f.title"` (decision 130): the same single-expression rule as `control`, for the
 * same reason — the value NAMES a node, and a node is a path.
 *
 * With no expression at all it degrades to a plain attribute, like `control` does: the author
 * wrote the name and nothing the emit could pair, and the diagnostic says what to write.
 */
function classifyError(attr: Attribute, name: MarkerName): ParseResult<Binding> {
  const handler = requireSingleExpression(attr);
  if (handler.expr === null) {
    return degrade(plainAttribute(attr, name), errorMarkerDiag(valueSpan(attr), name));
  }
  const binding: Binding = { type: 'error', name, span: attr.span, value: handler.expr };
  return handler.reason === null ? ok(binding) : degrade(binding, errorMarkerDiag(valueSpan(attr), name));
}

// ---------------------------------------------------------------------------
// Shared rules
// ---------------------------------------------------------------------------

/** Why an attribute value is not the single `@` expression a binding requires. */
type ValueProblem = 'missing' | 'concatenation';

/**
 * The "value = one `@`" rule (SDD-07 §4): `attr.value` must be exactly one
 * `razor-expression` part. When it is not, the best-fitting expression (the only one
 * present, if any) is still returned so the binding node — and its hover/completion in
 * the editor — survives the error.
 */
function requireSingleExpression(attr: Attribute): {
  readonly expr: RazorExpression | null;
  readonly reason: ValueProblem | null;
} {
  const expressions = attr.value.filter(isExpression);
  const only = expressions[0];

  if (only === undefined) return { expr: null, reason: 'missing' };
  if (attr.value.length === 1) return { expr: only, reason: null };
  // Text around the expression, or several expressions: a concatenation either way.
  return { expr: expressions.length === 1 ? only : null, reason: 'concatenation' };
}

function isExpression(part: AttributeValuePart): part is RazorExpression {
  return part.type === 'razor-expression';
}

/** `class:`/`style:` share FUD0095 for a prefix that names nothing (decision 22). */
function conditionalNameDiagnostics(
  attr: Attribute,
  name: string,
  kind: 'class' | 'style',
): Diagnostic[] {
  if (name.length > 0) return [];
  return [FUD0095({ span: nameSpan(attr, `${kind}:${name}`), kind })];
}

function conditionalValueDiag(attr: Attribute, kind: 'class' | 'style'): Diagnostic {
  return FUD0093({ span: valueSpan(attr), kind });
}

function busHandlerDiag(at: Span): Diagnostic {
  return FUD0096({ span: at });
}

function controlDiag(at: Span): Diagnostic {
  return FUD0590({ span: at });
}

function errorMarkerDiag(at: Span, name: MarkerName): Diagnostic {
  return FUD0596({ span: at, name });
}

function refDiag(at: Span): Diagnostic {
  return FUD0094({ span: at });
}

/** The degraded plain attribute every failing binding falls back to. */
function plainAttribute(attr: Attribute, name: string): Binding {
  return { type: 'attr', span: attr.span, name, value: attr.value };
}

function degrade(value: Binding, diagnostic: Diagnostic): ParseResult<Binding> {
  return withDiagnostics(value, [diagnostic]);
}

/**
 * Span of the attribute NAME. SDD-05 keeps no separate name span, but a literal name is
 * always the head of the attribute, so it ends `name.length` characters in. Callers pass
 * the VERBATIM name (prefix included); the expression-name form has its own span and
 * never comes through here.
 */
function nameSpan(attr: Attribute, name: string): Span {
  return span(attr.span.start, Math.min(attr.span.start + name.length, attr.span.end));
}

/**
 * Span to blame for a bad value: the value parts when there are any. With no parts
 * (`.value` with no `=`, or `.value=""`) there is no value text to point at, so the whole
 * attribute is blamed rather than an empty span — an empty span contains no offset and
 * would make the diagnostic unclickable in the editor.
 */
function valueSpan(attr: Attribute): Span {
  const first = attr.value[0];
  const last = attr.value[attr.value.length - 1];
  if (first === undefined || last === undefined) return attr.span;
  return span(first.span.start, last.span.end);
}
