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
import { COMPLETION_ONLY_CAPS, DIAGNOSTIC_ONLY_CAPS } from '../caps.js';
import type { TemplateContext } from './context.js';
import { copyExpression } from './expr.js';

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

/**
 * The GAPS of a start tag: the stretches where another attribute could be typed.
 *
 * Between the tag name and the first attribute, between two attributes, and between the last
 * one and the `>`. Each becomes a completion anchor, so `<app-badge |>`, `<app-badge | tone="x">`
 * and `<app-badge tone="x" |>` all have somewhere to ask.
 *
 * The gaps and not the whole area, and the difference is not cosmetic. One stretch covering
 * everything between the name and the `>` also covers the attribute VALUES — so a position
 * inside `tone="@(|)"` mapped both to the interpolation and to the anchor, and Volar answers
 * with the first mapped position that yields anything. While the object literal offered no
 * key completions there the anchor came back empty and the interpolation won; the moment
 * `$GlobalAttrs` gave it eleven names to offer, the union of `tone` stopped being reachable.
 * An anchor for "where a new attribute goes" must not stand over text that is already
 * something else.
 */
function attributeGaps(el: ElementNode): readonly Span[] {
  const afterName = el.openSpan.start + 1 + el.name.length;
  const beforeClose = el.openSpan.end - (ctxSelfClosing(el) ? 2 : 1);

  const gaps: Span[] = [];
  let cursor = Math.min(afterName, beforeClose);
  for (const attribute of el.attributes) {
    gaps.push(span(cursor, attribute.span.start));
    cursor = attribute.span.end;
  }
  gaps.push(span(cursor, beforeClose));

  // Emptied in one place rather than guarded at each push: a zero-length gap is a stretch no
  // position can ever fall inside, so it is noise in the mapping table. `<app-badge>` has no
  // gap at all, and `<app-badge tone="x">` has one at the front and none at the back.
  return gaps.filter((gap) => gap.end > gap.start);
}

/** `<x/>` closes with two characters, `<x>` with one. */
function ctxSelfClosing(el: ElementNode): boolean {
  return el.children.length === 0 && el.closeSpan === undefined;
}

/** A custom element: the hyphen is what makes it one (decision 41). */
function isComponent(tag: string): boolean {
  return tag.includes('-');
}

/**
 * The attributes that make up a component's props — everything that is not behaviour, and not
 * `slot`.
 *
 * `slot` comes out of the literal and is checked against the component's OWN slot union
 * (BUG-11 §4.2). The rest of HTML's global vocabulary — `id`, `part`, `data-*`, `aria-*` and
 * the others — stays in the literal and is accepted by `$GlobalAttrs`, which is a type and not
 * a list in this file: the emitter does not know those attributes exist, and does not need to.
 */
function emitProps(
  ctx: TemplateContext,
  el: ElementNode,
  bindings: readonly { attr: Attribute; binding: Binding }[],
): void {
  const props = bindings.filter(
    (b) => (b.binding.type === 'attr' || b.binding.type === 'property') && !isSlot(b),
  );

  ctx.w.scaffold('$attrs<', el.openSpan);
  // The tag's own span carries this one, under diagnostics-only capabilities: an
  // unregistered tag must report TS2304 here, but nothing else should route into a name
  // the user never wrote.
  ctx.w.projected(ctx.aliases.aliasOf(el.name), tagSpan(el), DIAGNOSTIC_ONLY_CAPS);
  ctx.w.scaffold('>({');
  // One anchor per gap of the start tag, all standing for the inside of the object literal:
  // this is what makes completion work at `<app-badge |>`, where there is no text yet to map
  // from and the contract that knows the answer lives in the projection.
  for (const gap of attributeGaps(el)) ctx.w.projected('\n  ', gap, COMPLETION_ONLY_CAPS);

  for (const { attr, binding } of props) {
    ctx.w.scaffold('\n  ');
    emitKey(ctx, attr, binding);
    ctx.w.scaffold(': ');
    emitValue(ctx, binding);
    ctx.w.scaffold(',');
  }

  ctx.w.scaffold(props.length === 0 ? '});\n' : '\n});\n');

  const slot = bindings.find(isSlot);
  if (slot !== undefined) emitIntoSlot(ctx, el, slot.binding);
}

/** A `slot="…"` written plainly: never `.slot`, never `@slot`. Narrows the binding with it. */
interface SlotBinding {
  readonly attr: Attribute;
  readonly binding: Extract<Binding, { type: 'attr' }>;
}

function isSlot(entry: { attr: Attribute; binding: Binding }): entry is SlotBinding {
  return entry.binding.type === 'attr' && entry.attr.name === 'slot';
}

/**
 * `slot="meta"` → `$intoSlot<$S0>('meta');`
 *
 * The literal is ONE stretch, quotes included, under the same profile as a projected tag —
 * exactly as `emitSection` writes a section name, and for the same reason: TypeScript reports
 * the `TS2345` over `'meta'` WITH its quotes, and a reported range only maps back when both of
 * its ends land in a single stretch carrying `verification`. Written as scaffold + copy +
 * scaffold, the error would reach nobody.
 *
 * An interpolated name is not projected at all: `slot="@(x)"` is a slot whose identity is not
 * known until it runs, and checking it against a union of literals would be checking a value
 * the projection cannot see.
 */
function emitIntoSlot(ctx: TemplateContext, el: ElementNode, binding: SlotBinding['binding']): void {
  const alias = ctx.aliases.slotsAliasOf(el.name);
  // No `<link>` for this tag: it already fails with TS2304 on its name, and its `$Slots` was
  // never imported. A second error on the same tag adds nothing (BUG-11 §4.4).
  if (alias === undefined) return;

  const only = binding.value.length === 1 ? binding.value[0] : undefined;
  if (only?.type !== 'attribute-text') return;

  ctx.w.scaffold(`$intoSlot<${alias}>(`, binding.span);
  ctx.w.projected(quote(only.value), only.span, DIAGNOSTIC_ONLY_CAPS);
  ctx.w.scaffold(');\n');
}

/** Native tags: only the interpolations are checked, one `$attr` each. */
function emitNativeAttrs(
  ctx: TemplateContext,
  bindings: readonly { attr: Attribute; binding: Binding }[],
): void {
  for (const { binding } of bindings) {
    // `.prop` and a plain attribute carry the same shape of value, so a native tag checks
    // them the same way: whatever interpolation is inside, and nothing else.
    if (binding.type !== 'attr' && binding.type !== 'property') continue;
    for (const part of binding.value) {
      if (part.type !== 'razor-expression') continue;
      ctx.w.scaffold('$attr(', part.span);
      copyExpression(ctx, part.expr);
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
      copyExpression(ctx, binding.value.expr);
      ctx.w.scaffold(');\n');
      return;

    case 'bus':
      // The bus name may itself be an expression (decision 28.b); either way the event
      // type is unknowable, so the handler is checked and the event is not.
      ctx.w.scaffold('$on(', attr.span);
      if (typeof binding.eventName === 'string') ctx.w.scaffold(`'${binding.eventName}'`);
      else copyExpression(ctx, binding.eventName.expr);
      ctx.w.scaffold(' as never, ');
      copyExpression(ctx, binding.value.expr);
      ctx.w.scaffold(');\n');
      return;

    case 'class':
      ctx.w.scaffold('$cls(', attr.span);
      copyExpression(ctx, binding.value.expr);
      ctx.w.scaffold(');\n');
      return;

    case 'style':
      ctx.w.scaffold('$sty(', attr.span);
      copyExpression(ctx, binding.value.expr);
      ctx.w.scaffold(');\n');
      return;

    case 'ref':
      // An assignment, never a declaration: by decision 30 the variable is the user's own,
      // already declared in `@code`. `const` here would redeclare it (TS2451) and steal the
      // definition go-to-definition should land on.
      copyExpression(ctx, binding.value.expr);
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
  /* c8 ignore next -- emitProps only ever passes 'attr' and 'property' bindings here. */
  if (binding.type !== 'attr' && binding.type !== 'property') return;

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
  copyExpression(ctx, expr.expr);
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
    copyExpression(ctx, part.expr);
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
