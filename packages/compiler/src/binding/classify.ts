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

import { type Diagnostic, errorDiag, type ParseResult, ok, withDiagnostics } from '../types/index.js';
import { type Span, span } from '../types/index.js';
import type { RazorExpression } from '../at/index.js';
import type { Attribute, AttributeValuePart } from '../html/index.js';
import {
  type Binding,
  type Interpolation,
  BUS_PREFIX,
  CLASS_PREFIX,
  STYLE_PREFIX,
  EVENT_PREFIX,
  PROPERTY_PREFIX,
  REF_NAME,
} from './nodes.js';

// ---------------------------------------------------------------------------
// Diagnostic codes — SDD-07 owns FUD0090..FUD0109 (§6)
// ---------------------------------------------------------------------------

const FUD_PROPERTY_NO_EXPRESSION = 'FUD0090';
const FUD_PROPERTY_CONCATENATION = 'FUD0091';
const FUD_EVENT_NO_HANDLER = 'FUD0092';
const FUD_CLASS_STYLE_NO_EXPRESSION = 'FUD0093';
const FUD_REF_NOT_SIMPLE_IDENTIFIER = 'FUD0094';
const FUD_CLASS_STYLE_NO_NAME = 'FUD0095';
const FUD_BUS_NO_HANDLER = 'FUD0096';
const FUD_BUS_NO_NAME = 'FUD0097';
const FUD_EXPRESSION_NAME_NOT_BUS = 'FUD0098';
const FUD_PREFIX_NO_NAME = 'FUD0099';

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
  if (name === REF_NAME) return classifyRef(attr, source);

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
    return degrade(
      plainAttribute(attr, prefix),
      errorDiag(
        FUD_EXPRESSION_NAME_NOT_BUS,
        `an expression attribute name is only valid after the reserved \`bus:\` prefix, not \`${prefix}\``,
        prefixSpan,
      ),
    );
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
    diagnostics.push(
      errorDiag(
        FUD_BUS_NO_NAME,
        'bus binding has no event name after `bus:`',
        nameSpan(attr, BUS_PREFIX + eventName),
      ),
    );
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
    diagnostics.push(
      errorDiag(
        FUD_PREFIX_NO_NAME,
        'event binding has no event name after `@`',
        nameSpan(attr, EVENT_PREFIX + eventName),
      ),
    );
  }

  const handler = requireSingleExpression(attr);
  if (handler.reason !== null) {
    diagnostics.push(
      errorDiag(
        FUD_EVENT_NO_HANDLER,
        'event binding value must be exactly one `@` handler (a reference or a lambda)',
        valueSpan(attr),
      ),
    );
  }
  if (handler.expr === null) {
    return withDiagnostics(plainAttribute(attr, EVENT_PREFIX + eventName), diagnostics);
  }
  return withDiagnostics(
    { type: 'event', span: attr.span, name: eventName, value: handler.expr },
    diagnostics,
  );
}

function classifyProperty(attr: Attribute, propertyName: string): ParseResult<Binding> {
  const diagnostics: Diagnostic[] = [];

  if (propertyName.length === 0) {
    diagnostics.push(
      errorDiag(
        FUD_PREFIX_NO_NAME,
        'property binding has no property name after `.`',
        nameSpan(attr, PROPERTY_PREFIX + propertyName),
      ),
    );
  }

  const handler = requireSingleExpression(attr);
  if (handler.reason === 'concatenation') {
    // Decision 24: a property carries a VALUE, not a string built by concatenation.
    diagnostics.push(
      errorDiag(
        FUD_PROPERTY_CONCATENATION,
        'property binding value must not concatenate parts: use a single `@` expression',
        valueSpan(attr),
      ),
    );
  } else if (handler.reason === 'missing') {
    diagnostics.push(
      errorDiag(
        FUD_PROPERTY_NO_EXPRESSION,
        'property binding value must be a single `@` expression',
        valueSpan(attr),
      ),
    );
  }
  if (handler.expr === null) {
    return withDiagnostics(plainAttribute(attr, PROPERTY_PREFIX + propertyName), diagnostics);
  }
  return withDiagnostics(
    { type: 'property', span: attr.span, name: propertyName, value: handler.expr },
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
  return [
    errorDiag(
      FUD_CLASS_STYLE_NO_NAME,
      `\`${kind}:\` binding has no name after \`:\``,
      nameSpan(attr, `${kind}:${name}`),
    ),
  ];
}

function conditionalValueDiag(attr: Attribute, kind: 'class' | 'style'): Diagnostic {
  return errorDiag(
    FUD_CLASS_STYLE_NO_EXPRESSION,
    `\`${kind}:\` binding value must be a single \`@\` expression`,
    valueSpan(attr),
  );
}

function busHandlerDiag(at: Span): Diagnostic {
  return errorDiag(FUD_BUS_NO_HANDLER, 'bus binding value must be exactly one `@` handler', at);
}

function refDiag(at: Span): Diagnostic {
  return errorDiag(
    FUD_REF_NOT_SIMPLE_IDENTIFIER,
    'ref value must be a single simple identifier, e.g. `ref="@input"`',
    at,
  );
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
