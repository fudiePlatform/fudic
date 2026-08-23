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
  attributeValueSpan,
  classifyAttribute,
  crossing,
  handlerShape,
  unwrapParens,
  type Attribute,
  type AttributeValuePart,
  type Binding,
  type ElementNode,
  type OxcNode,
  type RazorExpression,
  type Span,
  span,
} from '@fudic/compiler';
import { COMPLETION_ONLY_CAPS, DIAGNOSTIC_ONLY_CAPS, LITERAL_NAME_CAPS } from '../caps.js';
import type { TemplateContext } from './context.js';
import { copyExpression, copyRazor } from './expr.js';

/** A JS identifier, i.e. an object key that needs no quoting. */
const PLAIN_KEY = /^[\p{ID_Start}$_][\p{ID_Continue}$]*$/u;

/** In fudic an event is written with an at-sign, and a property with a dot. */
const EVENT_PREFIX = '@';

/**
 * The event name of an attribute the author opened with `@`, or `undefined` when it is not
 * one.
 *
 * It reads the VERBATIM name and not the classification on purpose. `@cli` with no value yet
 * is a half-written event, and classification degrades it to a plain attribute called `@cli`
 * (`FUD0092`, no handler) — which is exactly the moment the editor has to answer, so the
 * projection cannot afford to have lost the fact that an `@` opened it.
 */
function eventNameOf(attr: Attribute, binding: Binding): string | undefined {
  if (binding.type === 'event') return binding.name;
  // A `bus:(expr)` name is a RazorExpression, never a string, and never an event.
  if (typeof attr.name !== 'string') return undefined;
  return attr.name.startsWith(EVENT_PREFIX)
    ? attr.name.slice(EVENT_PREFIX.length)
    : undefined;
}

/** One attribute with the binding it classifies to — what every emitter below takes. */
interface Entry {
  readonly attr: Attribute;
  readonly binding: Binding;
}

/** Project every attribute of an element. */
export function emitElementBindings(ctx: TemplateContext, el: ElementNode): void {
  const bindings = el.attributes.map((attr) => ({
    attr,
    binding: classifyAttribute(attr, ctx.source).value,
  }));

  if (isComponent(el.name)) emitProps(ctx, el, bindings);
  else emitNativeAttrs(ctx, bindings);

  // On EVERY element, and against the parent: a `<div slot="x">` is exactly as wrong as a
  // `<app-badge slot="x">` when the host declares no `x` (BUG-23 §2.6).
  const slot = bindings.find(isSlot);
  if (slot !== undefined) emitIntoSlot(ctx, slot.attr, slot.binding);

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
 * A component tag becomes TWO object literals, and which one a binding lands in is the whole
 * of BUG-16 §4.2 — plus a third call that checks nothing but COMPLETENESS.
 *
 *     <app-badge .tone="@(t)" id="x">
 *       →  $props<$C0>({ tone: (t) });   // the component's contract, the dot completes here
 *          $attrs<{}>({ id: "x" });      // `{} & $GlobalAttrs`: HTML's vocabulary, nothing else
 *          $required<$C0, 'tone'>({});   // over the tag NAME: what was not passed
 *
 * In fudic a property is written with a dot, so a plain attribute on a component is not a
 * prop — it is what HTML says an element understands. Checking it against `{}` is what makes
 * `tone="info"` an error, with TypeScript's own message on the name and its own suggestion
 * when the name is a misspelt global. No list of attributes lives in this file, and no `FUD`
 * code was minted for it.
 *
 * `slot` is in neither: it is checked against the union of the PARENT, from `emitIntoSlot`.
 *
 * The gap anchors moved to the GLOBALS literal, and that is decision (b) of BUG-23 §4.0: a
 * gap is where a new attribute goes, and on a component the only thing that can be written
 * without a dot is HTML's own vocabulary. The props are reached with the `.`, which has an
 * anchor of its own. It changes SDD-24 §6.3, which pinned the opposite.
 */
function emitProps(ctx: TemplateContext, el: ElementNode, bindings: readonly Entry[]): void {
  const props: Entry[] = [];
  const globals: Entry[] = [];
  /** The prop names actually WRITTEN — the `K` of `$required`. A bare `.` names none. */
  const written: string[] = [];

  for (const entry of bindings) {
    if (entry.binding.type === 'property') {
      props.push(entry);
      if (entry.binding.name.length > 0) written.push(`'${entry.binding.name}'`);
      continue;
    }
    // A half-written `@cli` degraded to a plain attribute is still an event, and an event
    // is not HTML's vocabulary: it would report TS2353 on a name that is not wrong, only
    // unfinished. `slot` is nobody's vocabulary here — it is the parent's union.
    const opening = eventNameOf(entry.attr, entry.binding);
    if (entry.binding.type === 'attr' && !isSlot(entry) && opening === undefined) {
      globals.push(entry);
    }
  }
  const alias = ctx.aliases.aliasOf(el.name);

  ctx.w.scaffold('$props<', el.openSpan);
  // The tag's own span carries this one, under diagnostics-only capabilities: an
  // unregistered tag must report TS2304 here, but nothing else should route into a name
  // the user never wrote.
  ctx.w.projected(alias, tagSpan(el), DIAGNOSTIC_ONLY_CAPS);
  ctx.w.scaffold('>({');
  emitEntries(ctx, props);
  ctx.w.scaffold(props.length === 0 ? '});\n' : '\n});\n');

  // Always, because this is where the gap anchors live now — `<app-badge |>` must have
  // somewhere to ask even when the tag carries no plain attribute at all.
  ctx.w.scaffold('$attrs<{}>({', el.openSpan);
  // One anchor per gap of the start tag, all standing for the inside of the object literal:
  // this is what makes completion work at `<app-badge |>`, where there is no text yet to map
  // from and the type that knows the answer lives in the projection.
  for (const gap of attributeGaps(el)) ctx.w.projected('\n  ', gap, COMPLETION_ONLY_CAPS);
  emitEntries(ctx, globals);
  ctx.w.scaffold(globals.length === 0 ? '});\n' : '\n});\n');

  emitRequired(ctx, el, alias, written);
}

/**
 * `$required<$C0, 'name' | 'tone'>(⟨{} over the tag name⟩);`
 *
 * `K` is the union of the props the author DID write, so the type argument computes what is
 * left. With none written it is `never`, and every required prop is missing.
 *
 * Nothing at all for a tag with no `<link>`: its contract was never imported, so asking what
 * is missing from a type that does not exist adds a second error to the `TS2304` already on
 * the name — the same silence `emitIntoSlot` keeps, and for the same reason (BUG-11 §4.4).
 */
function emitRequired(
  ctx: TemplateContext,
  el: ElementNode,
  alias: string,
  written: readonly string[],
): void {
  if (ctx.aliases.slotsAliasOf(el.name) === undefined) return;

  ctx.w.scaffold(`$required<${alias}, ${written.length === 0 ? 'never' : written.join(' | ')}>(`);
  // ONE stretch, both ends inside it: `TS2345` is reported over the whole argument, and a
  // range only maps back when both of its ends land in a single stretch carrying
  // `verification`. Over the tag NAME, which is where the author reads what is missing.
  ctx.w.projected('{}', tagSpan(el), DIAGNOSTIC_ONLY_CAPS);
  ctx.w.scaffold(');\n');
}

/**
 * The `key: value,` lines of one literal, each key copied from the source.
 *
 * A dot with no name yet is the exception, and it is the whole of BUG-16 §4.3: `.|` has no
 * name to copy, so it gets an ANCHOR instead — the same recourse the gaps of the start tag
 * use, one character further in. Writing a key there would be inventing a name; writing
 * nothing would leave the one position where the prop list is wanted unable to ask.
 */
function emitEntries(ctx: TemplateContext, entries: readonly Entry[]): void {
  for (const { attr, binding } of entries) {
    if (binding.type === 'property' && binding.name.length === 0) {
      ctx.w.projected('\n  ', attr.span, COMPLETION_ONLY_CAPS);
      continue;
    }
    ctx.w.scaffold('\n  ');
    emitKey(ctx, attr, binding);
    ctx.w.scaffold(': ');
    emitValue(ctx, binding);
    ctx.w.scaffold(',');
  }
}

/** A `slot="…"` written plainly: never `.slot`, never `@slot`. Narrows the binding with it. */
interface SlotBinding {
  readonly attr: Attribute;
  readonly binding: Extract<Binding, { type: 'attr' }>;
}

function isSlot(entry: Entry): entry is SlotBinding {
  return entry.binding.type === 'attr' && entry.attr.name === 'slot';
}

/**
 * `slot="meta"` → `$intoSlot<$S_parent>('meta');`
 *
 * Against the `$Slots` of the PARENT, and on EVERY element (BUG-23 §2.6). A slot is declared
 * by the component the child goes INTO, so asking the element that carries the `slot=` was
 * only ever right by coincidence — when both happened to declare the same name. And it was
 * asked from `emitProps`, which runs on hyphenated tags alone, so `<div slot="p">` was checked
 * against nothing at all.
 *
 * With no component parent the union is `never`: a `slot=` outside a host fills nothing, and
 * that is exactly what `never` says. A parent with no `<link>` is the one silence kept — it
 * already fails with `TS2304` on its name, and a second error about its slots adds nothing
 * (BUG-11 §4.4).
 *
 * The name is projected 1:1 under `LITERAL_NAME_CAPS`, quotes as scaffolding — the profile
 * `@click` uses, and for its two reasons: the diagnostic must reach the source, and the
 * COMPLETION list is the point, since asking this position is asking for the parent's slots.
 * A 1:1 stretch is also what keeps the replacement range exactly the name.
 *
 * An interpolated name is not projected at all: `slot="@(x)"` is a slot whose identity is not
 * known until it runs, and checking it against a union of literals would be checking a value
 * the projection cannot see.
 */
function emitIntoSlot(ctx: TemplateContext, attr: Attribute, binding: SlotBinding['binding']): void {
  const alias = slotsAlias(ctx);
  if (alias === undefined) return;

  // A concatenation is not a name either: only an empty value or one literal run is.
  if (binding.value.length > 1) return;
  const only = binding.value[0];
  if (only !== undefined && only.type !== 'attribute-text') return;

  ctx.w.scaffold(`$intoSlot<${alias}>(`, binding.span);
  if (only === undefined) {
    // `slot=""` — the quotes are typed and the name is not, so the INSIDE of the literal
    // becomes the anchor. Zero-length and at the caret, for the reason `emitEventName`
    // explains: an anchor spanning the whole `slot=""` is seven source characters against two
    // generated ones, and `Math.min` then drops the caret onto the closing quote, where
    // nothing is offered. Which is why the slot list only appeared after a letter was typed.
    const inside = attributeValueSpan(ctx.source, attr) ?? attr.span;
    ctx.w.scaffold("'");
    ctx.w.projected(' ', span(inside.start, inside.start), COMPLETION_ONLY_CAPS);
    ctx.w.scaffold("'");
  } else {
    // One stretch, QUOTES INCLUDED. TypeScript reports the `TS2345` over `'p'` with them, and
    // a reported range only maps back when both of its ends land in a single stretch carrying
    // `verification` — the `@section` lesson. `LITERAL_NAME_CAPS` rather than diagnostics-only
    // because the list is the point here too: this position is asking for the parent's slots.
    ctx.w.projected(quote(only.value), only.span, LITERAL_NAME_CAPS);
  }
  ctx.w.scaffold(');\n');
}

/** The slot union to check against: the parent's, `never` with no component parent. */
function slotsAlias(ctx: TemplateContext): string | undefined {
  return ctx.host === undefined ? 'never' : ctx.aliases.slotsAliasOf(ctx.host);
}

/** Native tags: only the interpolations are checked, one `$attr` each. */
function emitNativeAttrs(ctx: TemplateContext, bindings: readonly Entry[]): void {
  for (const { binding } of bindings) {
    // `.prop` and a plain attribute carry the same shape of value, so a native tag checks
    // them the same way: whatever interpolation is inside, and nothing else.
    if (binding.type !== 'attr' && binding.type !== 'property') continue;
    // The emit crosses `id="@titulo"` as `titulo()` too — `crossingExpr` has exactly two
    // callers and this is the second (BUG-23 §2.8).
    const read = crossesAsRead(ctx, binding.value);
    for (const part of binding.value) {
      if (part.type !== 'razor-expression') continue;
      ctx.w.scaffold('$attr(', part.span);
      copyRazor(ctx, part);
      if (read) ctx.w.scaffold('()');
      ctx.w.scaffold(');\n');
    }
  }
}

/**
 * Whether the emit will cross this value as the READ of a reactive rather than as written
 * (decision 84), asked with the very function the emit asks it with.
 *
 * `crossing` is the one definition, in `@fudic/compiler`, and that is the invariant of BUG-23
 * §5: where the emit transforms a value before crossing it, the projection applies the same
 * transformation. A rule only one of the two knows is how the editor came to type-check
 * `Signal<string>` against a `name: string` the build never handed it.
 *
 * No `target` is passed, so the answer is always the `'value'` form — the shared cell of
 * SDD-31 §7 is decided and has no emitter, in the build or here.
 */
function crossesAsRead(ctx: TemplateContext, value: readonly AttributeValuePart[]): boolean {
  return crossing(ctx.source, value, ctx.reactives) !== undefined;
}

/** Events, bus subscriptions, conditional class/style and `ref` — the non-prop bindings. */
function emitBehaviour(
  ctx: TemplateContext,
  el: ElementNode,
  attr: Attribute,
  binding: Binding,
): void {
  // An event still being written. Classification degraded it to a plain attribute, but the
  // `@` is the author's and the editor is asking right now, so the call is projected anyway
  // — the arity error lands on scaffolding that routes to nobody.
  const opening = eventNameOf(attr, binding);
  if (opening !== undefined && binding.type !== 'event') {
    ctx.w.scaffold('$on(', attr.span);
    emitEventName(ctx, attr, opening);
    emitOpenHandler(ctx, attr);
    ctx.w.scaffold(');\n');
    return;
  }

  switch (binding.type) {
    case 'event':
      // A hyphen means a custom event, which has no entry in `HTMLElementEventMap`; `as
      // never` keeps the handler checked as a function while giving up on the event type
      // (decision 28). A standard name stays typed, so `e` is a `MouseEvent` in `@click`.
      ctx.w.scaffold('$on(', attr.span);
      emitEventName(ctx, attr, binding.name);
      if (binding.name.includes('-')) ctx.w.scaffold(' as never');
      ctx.w.scaffold(', ');
      emitHandler(ctx, binding.value);
      ctx.w.scaffold(');\n');
      return;

    case 'bus':
      // The bus name may itself be an expression (decision 28.b); either way the event
      // type is unknowable, so the handler is checked and the event is not.
      ctx.w.scaffold('$on(', attr.span);
      if (typeof binding.eventName === 'string') ctx.w.scaffold(`'${binding.eventName}'`);
      else copyRazor(ctx, binding.eventName);
      ctx.w.scaffold(' as never, ');
      emitHandler(ctx, binding.value);
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

/**
 * The second argument of an event whose handler is OPENED but not finished (BUG-23, TODO 3).
 *
 * `@click=@` degrades to a plain attribute, because a `@` with no identifier behind it is not
 * a `RazorExpression` at all — the tokenizer only scans one where an identifier starts — so
 * `requireSingleExpression` finds none and reports `FUD0092`. The projection then wrote
 * `$on('click');`, with nothing between the parentheses but the name: the one position where
 * the author is asking «which of my functions goes here?» had no stretch to ask from, and the
 * editor answered with silence. Which is TODO 3 exactly.
 *
 * So the argument is projected even though there is no expression to copy, exactly as
 * `copyExpression` does for the expression that is not there yet. The anchor is ZERO-LENGTH at
 * the END of the value, and both halves of that matter: Volar maps a source offset into a
 * stretch with `Math.min(relativePos, generatedLength)`, so a stretch that COVERS the `@`
 * would push the caret sitting after it past the anchor and onto the `)`. A single point at
 * the caret maps to the start of the anchor, which is where the question is asked.
 *
 * The value span decides, not the parts: `attributeValueSpan` returns `undefined` exactly when
 * no `=` was written, which is the difference between `@click` — a name with no handler yet,
 * and nothing to complete — and `@click=`, where the author has committed to writing one. It
 * also covers `@click=""` and `@click="@"` for free, since both have a value span and neither
 * has an expression.
 */
function emitOpenHandler(ctx: TemplateContext, attr: Attribute): void {
  const value = attributeValueSpan(ctx.source, attr);
  if (value === undefined) return;

  ctx.w.scaffold(', ');
  ctx.w.projected(' ', span(value.end, value.end), COMPLETION_ONLY_CAPS);
}

/**
 * The listener a handler value subscribes — the SAME shape the emit subscribes.
 *
 * A value whose root is a call is an invocation deferred to DISPATCH (decisions 96–98):
 * `@click="@onClick($event)"` emits `($event) => onClick($event)`, so the projection writes
 * the very same arrow. That is what makes the two errors of BUG-23 §2.4 disappear without a
 * rule of ours: `$event` is the arrow's PARAMETER — declared in no `.d.ts` — and its type is
 * whatever `$on` gives it contextually, `MouseEvent` in `@click` and `never` in a `bus:`.
 *
 * The other three shapes are copied as they are, exactly as before. And so is a call when
 * nobody handed the emitter a batch that registers attribute values: the shape is a question
 * about the AST, and without one the honest answer is to change nothing.
 */
function emitHandler(ctx: TemplateContext, value: RazorExpression): void {
  const deferred = handlerShape(rootAt(ctx, value.expr)) === 'call';
  if (deferred) ctx.w.scaffold('($event) => ');
  copyRazor(ctx, value);
}

/** The root node registered at a span, past the parentheses the author wrote. */
function rootAt(ctx: TemplateContext, at: Span): OxcNode | undefined {
  const ast = ctx.ast?.(at);
  return ast === undefined || Array.isArray(ast) ? undefined : unwrapParens(ast as OxcNode);
}

/**
 * The event name, as a string literal PROJECTED from the source — quotes included.
 *
 * It used to be scaffolding: the emitter wrote `'click'` out of the binding, so the name the
 * user typed did not exist for the editor and there was no position from which to ask what a
 * valid event is. Now it is one stretch standing for the name, the same recourse `@section`
 * uses and for one more reason than it: `$on`'s first parameter is
 * `keyof HTMLElementEventMap`, so asking THIS position for completions IS asking the DOM for
 * its event names, spelled without `on`, with no table kept here to go stale.
 *
 * The quotes are inside the stretch on purpose. A range whose ends fall in different
 * stretches maps back nowhere, and TypeScript reports over the literal WITH its quotes.
 */
function emitEventName(ctx: TemplateContext, attr: Attribute, name: string): void {
  if (name.length === 0) {
    // `@|` — the at-sign is typed and nothing else. There is no name to project, so the
    // INSIDE of the literal becomes an anchor: a position whose contextual type is
    // `keyof HTMLElementEventMap`, which is the list the developer is asking for.
    //
    // ZERO-LENGTH, at the caret, and that is the correction of BUG-23. Volar maps a source
    // offset into a stretch with `Math.min(relativePos, generatedLength)`, so a stretch that
    // COVERS the `@` puts the caret sitting after it one character deep — and TypeScript only
    // answers a `"` trigger when the position is `literalStart + 1` exactly
    // (`isValidTrigger`). A single point maps to the START of the anchor, which is that
    // position. An anchor two characters wide was aiming at the same thing and overshot it.
    ctx.w.scaffold("'");
    ctx.w.projected(' ', span(attr.span.end, attr.span.end), COMPLETION_ONLY_CAPS);
    ctx.w.scaffold("'");
    return;
  }
  // The quotes are SCAFFOLDING and the name is a 1:1 stretch, which is the opposite of what
  // `@section` does — and the difference is completion. A stretch that carries the quotes is
  // two characters longer than what it stands for, so every offset inside it is shifted and
  // the range TypeScript hands back for `@cli|` would land on `li`, eating the `@` when the
  // item is accepted. Aligned 1:1, the replacement range is exactly the name.
  const start = attr.span.start + 1;
  ctx.w.scaffold("'");
  ctx.w.projected(name, span(start, start + name.length), LITERAL_NAME_CAPS);
  ctx.w.scaffold("'");
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
  else if (only?.type === 'razor-expression') emitExpression(ctx, only, crossesAsRead(ctx, parts));
  else if (only?.type === 'attribute-text') emitTextValue(ctx, only);
  else emitTemplateLiteral(ctx, parts);
}

/**
 * A literal value — and the one that only LOOKS literal.
 *
 * `.name=@` is an expression the author has just opened, but the tokenizer scans a
 * `RazorExpression` only where an identifier begins, so with nothing behind it the `@` degrades
 * to a plain attribute whose text is `"@"`. Projecting that as the string `"@"` is projecting a
 * value nobody meant, and it leaves the one position where the list is wanted with nowhere to
 * ask — which is why the names in scope only appeared after the first letter was typed.
 *
 * A lone `@` is never a literal: decision 1 spells one `@@`. So it is projected as the empty
 * expression it is, with the anchor `emitOpenHandler` uses and for its reason — ZERO LENGTH, at
 * the end of the value. Volar maps with `Math.min(relativePos, generatedLength)`, so an anchor
 * that covered the `@` would push the caret past the hole and onto the closing parenthesis.
 */
function emitTextValue(ctx: TemplateContext, only: Extract<AttributeValuePart, { type: 'attribute-text' }>): void {
  if (only.value !== EVENT_PREFIX) {
    ctx.w.scaffold(quote(only.value), only.span);
    return;
  }

  ctx.w.scaffold('(');
  ctx.w.projected(' ', span(only.span.end, only.span.end), COMPLETION_ONLY_CAPS);
  ctx.w.scaffold(')');
}

/**
 * `(expr)` — parenthesized so that a comma or an arrow inside cannot break the object.
 *
 * `read` adds the call the emit adds: `.name="@titulo"` crosses as `titulo()`, so the literal
 * says `name: (titulo()),`. The `()` is SCAFFOLDING and carries no mapping — the author never
 * typed it, so nothing navigates to it, nothing renames through it, and no diagnostic lands
 * on it. What is mapped stays `titulo`, exactly as before.
 */
function emitExpression(ctx: TemplateContext, expr: RazorExpression, read = false): void {
  ctx.w.scaffold('(');
  copyRazor(ctx, expr);
  if (read) ctx.w.scaffold('()');
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
