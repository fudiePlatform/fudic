/**
 * Attributes and bindings of one element (SDD-23 §4.4).
 *
 * A component tag becomes one object literal checked against the component's contract:
 *
 *     <app-badge tone="@(x)">  →  $attrs<$C0>({ tone: (x) });
 *
 * so a wrong value is `TS2322` on the value, a misspelt attribute is `TS2561` with the
 * right suggestion on the name, and an unregistered tag is `TS2304` on the tag. Three rules
 * of the grammar, zero validators.
 *
 * A native tag has no contract to check against, so only its interpolations are projected,
 * through `$attr`, which demands a `$Scalar` (decision 19).
 */

import {
  classifyAttribute,
  type Attribute,
  type AttributeValuePart,
  type Binding,
  type ElementNode,
  type RazorExpression,
  type Span,
  span,
} from '@fudic/compiler';
import { DIAGNOSTIC_ONLY_CAPS } from '../caps.js';
import type { TemplateContext } from './context.js';

/** A JS identifier, i.e. an object key that needs no quoting. */
const PLAIN_KEY = /^[\p{ID_Start}$_][\p{ID_Continue}$]*$/u;

/** Project every attribute of an element. */
export function emitElementBindings(ctx: TemplateContext, el: ElementNode): void {
  const bindings = el.attributes.map((attr) => ({
    attr,
    binding: classifyAttribute(attr, ctx.source).value,
  }));

  if (isComponent(el.name)) emitProps(ctx, el, bindings);
  else emitNativeAttrs(ctx, bindings);

  for (const { attr, binding } of bindings) emitBehaviour(ctx, el, attr, binding);
}

/** A custom element: the hyphen is what makes it one (decision 41). */
function isComponent(tag: string): boolean {
  return tag.includes('-');
}

/** The attributes that make up a component's props — everything that is not behaviour. */
function emitProps(
  ctx: TemplateContext,
  el: ElementNode,
  bindings: readonly { attr: Attribute; binding: Binding }[],
): void {
  const props = bindings.filter((b) => b.binding.type === 'attr' || b.binding.type === 'property');

  ctx.w.scaffold('$attrs<', el.openSpan);
  // The tag's own span carries this one, under diagnostics-only capabilities: an
  // unregistered tag must report TS2304 here, but nothing else should route into a name
  // the user never wrote.
  ctx.w.projected(ctx.aliases.aliasOf(el.name), tagSpan(el), DIAGNOSTIC_ONLY_CAPS);
  ctx.w.scaffold('>({');

  for (const { attr, binding } of props) {
    ctx.w.scaffold('\n  ');
    emitKey(ctx, attr, binding);
    ctx.w.scaffold(': ');
    emitValue(ctx, binding);
    ctx.w.scaffold(',');
  }

  ctx.w.scaffold(props.length === 0 ? '});\n' : '\n});\n');
}

/** Native tags: only the interpolations are checked, one `$attr` each. */
function emitNativeAttrs(
  ctx: TemplateContext,
  bindings: readonly { attr: Attribute; binding: Binding }[],
): void {
  for (const { binding } of bindings) {
    if (binding.type === 'property') {
      ctx.w.scaffold('$attr(', binding.span);
      ctx.w.copy(binding.value.expr);
      ctx.w.scaffold(');\n');
      continue;
    }
    if (binding.type !== 'attr') continue;
    for (const part of binding.value) {
      if (part.type !== 'razor-expression') continue;
      ctx.w.scaffold('$attr(', part.span);
      ctx.w.copy(part.expr);
      ctx.w.scaffold(');\n');
    }
  }
}

/** Events, bus subscriptions, conditional class/style and `ref` — the non-prop bindings. */
function emitBehaviour(
  ctx: TemplateContext,
  el: ElementNode,
  attr: Attribute,
  binding: Binding,
): void {
  switch (binding.type) {
    case 'event':
      // A hyphen means a custom event, which has no entry in `HTMLElementEventMap`; `as
      // never` keeps the handler checked as a function while giving up on the event type
      // (decision 28). A standard name stays typed, so `e` is a `MouseEvent` in `@click`.
      ctx.w.scaffold('$on(', attr.span);
      ctx.w.scaffold(`'${binding.name}'${binding.name.includes('-') ? ' as never' : ''}, `);
      ctx.w.copy(binding.value.expr);
      ctx.w.scaffold(');\n');
      return;

    case 'bus':
      // The bus name may itself be an expression (decision 28.b); either way the event
      // type is unknowable, so the handler is checked and the event is not.
      ctx.w.scaffold('$on(', attr.span);
      if (typeof binding.eventName === 'string') ctx.w.scaffold(`'${binding.eventName}'`);
      else ctx.w.copy(binding.eventName.expr);
      ctx.w.scaffold(' as never, ');
      ctx.w.copy(binding.value.expr);
      ctx.w.scaffold(');\n');
      return;

    case 'class':
      ctx.w.scaffold('$cls(', attr.span);
      ctx.w.copy(binding.value.expr);
      ctx.w.scaffold(');\n');
      return;

    case 'style':
      ctx.w.scaffold('$sty(', attr.span);
      ctx.w.copy(binding.value.expr);
      ctx.w.scaffold(');\n');
      return;

    case 'ref':
      // An assignment, never a declaration: by decision 30 the variable is the user's own,
      // already declared in `@code`. `const` here would redeclare it (TS2451) and steal the
      // definition go-to-definition should land on.
      ctx.w.copy(binding.value.expr);
      ctx.w.scaffold(` = $ref<$El<'${el.name}'>>();\n`, attr.span);
      return;

    default:
      return;
  }
}

/** The property name, copied from the source so a typo reports on the user's characters. */
function emitKey(ctx: TemplateContext, attr: Attribute, binding: Binding): void {
  const name = binding.type === 'property' ? binding.name : (attr.name as string);
  const quoted = !PLAIN_KEY.test(name);
  const at = nameSpan(attr, binding, name);

  if (quoted) ctx.w.scaffold("'");
  ctx.w.copy(at);
  if (quoted) ctx.w.scaffold("'");
}

/**
 * Where the name sits in the source. A `.prop` binding writes the dot in the source but
 * not in the projection, so its name starts one character later.
 */
function nameSpan(attr: Attribute, binding: Binding, name: string): Span {
  const start = attr.span.start + (binding.type === 'property' ? 1 : 0);
  return span(start, start + name.length);
}

/** The property value: exact type for a lone expression, `string` for a concatenation. */
function emitValue(ctx: TemplateContext, binding: Binding): void {
  if (binding.type === 'property') {
    emitExpression(ctx, binding.value);
    return;
  }
  /* c8 ignore next -- emitProps only ever passes 'attr' and 'property' bindings here. */
  if (binding.type !== 'attr') return;

  const parts = binding.value;
  const only = parts.length === 1 ? parts[0]! : undefined;

  // A bare attribute is `true` (decision 44); a lone expression keeps its exact type
  // (decision 24); anything else is a concatenation, checked as a string (decision 20).
  if (parts.length === 0) ctx.w.scaffold('true', binding.span);
  else if (only?.type === 'razor-expression') emitExpression(ctx, only);
  else if (only?.type === 'attribute-text') ctx.w.scaffold(quote(only.value), only.span);
  else emitTemplateLiteral(ctx, parts);
}

/** `(expr)` — parenthesized so that a comma or an arrow inside cannot break the object. */
function emitExpression(ctx: TemplateContext, expr: RazorExpression): void {
  ctx.w.scaffold('(');
  ctx.w.copy(expr.expr);
  ctx.w.scaffold(')');
}

/** `` `pre-${expr}-post` `` — the literal runs escaped, the expressions copied verbatim. */
function emitTemplateLiteral(ctx: TemplateContext, parts: readonly AttributeValuePart[]): void {
  ctx.w.scaffold('`');
  for (const part of parts) {
    if (part.type === 'attribute-text') {
      ctx.w.scaffold(escapeTemplate(part.value), part.span);
      continue;
    }
    ctx.w.scaffold('${');
    ctx.w.copy(part.expr);
    ctx.w.scaffold('}');
  }
  ctx.w.scaffold('`');
}

/**
 * A static value becomes an escaped string literal rather than a verbatim copy: it is data,
 * not code — there is no symbol inside to hover or rename — and copying it unescaped would
 * let a quote in the user's text break the projection.
 */
function quote(value: string): string {
  return JSON.stringify(value);
}

function escapeTemplate(value: string): string {
  return value.replace(/[\\`]/g, '\\$&').replace(/\$\{/g, '\\${');
}

/** The tag name inside the start tag: `<app-badge …>` → `app-badge`. */
function tagSpan(el: ElementNode): Span {
  const start = el.openSpan.start + 1;
  return span(start, start + el.name.length);
}
