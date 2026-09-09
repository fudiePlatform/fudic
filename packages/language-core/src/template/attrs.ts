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
  CONTROL_NAME,
  CONTROL_PROP,
  controlTarget,
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

/**
 * A `control` whose value is OPEN: `control=`, `control=""`, `control="@"`.
 *
 * The twin of `eventNameOf`, and it exists for that function's reason. A value the grammar
 * cannot read as one `@` expression degrades the whole binding to a plain attribute
 * (`classifyControl`), so by the time the projection sees `<input control=|>` the binding no
 * longer says «control» — and that is exactly the moment the author is asking which node goes
 * there. The VERBATIM name is what survives the degrading, so the verbatim name is what this
 * reads.
 *
 * The value SPAN decides the rest, the rule `emitOpenHandler` states: `attributeValueSpan`
 * returns nothing precisely when no `=` was written, which separates a `control` that is only
 * a name from a `control` whose value the author has committed to.
 *
 * `undefined` for a binding that classified, because the `control` branch below owns that one
 * and projecting it twice would check one crossing two ways.
 */
function openControlValue(
  ctx: TemplateContext,
  attr: Attribute,
  binding: Binding,
): Span | undefined {
  if (binding.type === 'control') return undefined;
  if (typeof attr.name !== 'string' || attr.name.toLowerCase() !== CONTROL_NAME) return undefined;
  return attributeValueSpan(ctx.source, attr);
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
 * A component tag becomes two object literals that CHECK, and two calls that only answer.
 *
 *     <app-badge .tone="@(t)" id="x">
 *       →  $props<$C0>({ tone: (t) });   // the component's contract, the dot completes here
 *          $attrs<{}>({ id: "x" });      // `{} & $GlobalAttrs`: HTML's vocabulary, nothing else
 *          $gap<$C0>({ ⟨anchors⟩ });     // what may be written at an EMPTY position
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
 * The gaps have a call of their OWN, and that repeals decision (b) of BUG-23 §4.0. They used
 * to live in the globals literal, on the argument that a gap is where a new attribute goes and
 * the only thing writable there without a dot is HTML's vocabulary. True, and beside the
 * point: `<app-badge |>` is the developer asking what this component takes, and being answered
 * `id`, `class` and `role` is being answered the half they already knew. `$gap` carries BOTH
 * families — the props with their dot in the key — so the one reply Volar allows can hold the
 * whole answer. SDD-24 §6.3 is restored.
 *
 * Two calls rather than one because they are two different things: `$attrs` is where a written
 * attribute is CHECKED, `$gap` is where an empty position ASKS. Merging them would put the
 * props into the type an `id="x"` is verified against, and `tone="info"` would stop being the
 * error that BUG-16 §4.2 made it.
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
    // A `control` on a component tag WAS written, and it fills `ctrl`: leaving it out of `K`
    // made `$required` report the one prop the author had just passed.
    if (entry.binding.type === 'control') {
      props.push(entry);
      written.push(`'${CONTROL_PROP}'`);
      continue;
    }
    // The same binding half written: `<app-input control=|>`. Degraded to a plain attribute it
    // fell into the globals literal, where `$attrs<{}>` reported `TS2353` over the one name the
    // author had just chosen correctly — and the position where the form's nodes are the whole
    // answer had nothing to ask from. It is the `ctrl` prop here as much as when it is
    // finished, so it goes with the props and `emitEntries` writes it a hole.
    if (openControlValue(ctx, entry.attr, entry.binding) !== undefined) {
      props.push(entry);
      written.push(`'${CONTROL_PROP}'`);
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
  // The contract is handed down only when the tag really has one: an unregistered tag already
  // fails with `TS2304` on its name, and indexing a type that does not exist would add a
  // second error in a stretch no capability routes through (BUG-11 §4.4).
  emitEntries(ctx, props, ctx.aliases.slotsAliasOf(el.name) === undefined ? undefined : alias);
  ctx.w.scaffold(props.length === 0 ? '});\n' : '\n});\n');

  // Only what was WRITTEN: an empty literal when the tag carries no plain attribute, because
  // nothing has to be checked then and nothing asks from here any more.
  ctx.w.scaffold('$attrs<{}>({', el.openSpan);
  emitEntries(ctx, globals);
  ctx.w.scaffold(globals.length === 0 ? '});\n' : '\n});\n');

  emitGaps(ctx, el, alias);
  emitRequired(ctx, el, alias, written);
}

/**
 * `$gap<$C0>({ ⟨one anchor per empty position of the start tag⟩ });`
 *
 * The call that checks nothing. Every key of `$gap`'s parameter is optional, so an empty
 * argument is always valid, and the stretches inside it carry completion alone — which is what
 * lets its type be the generous one without a single diagnostic hanging off it.
 *
 * Emitted for every component tag, with anchors or without: `<app-badge>` has no gap at all
 * (`attributeGaps` drops the empty ones), and the call is still written so that the shape of
 * the projection does not depend on the text.
 *
 * An UNREGISTERED tag is typed `{}` rather than named, and it is the same reasoning
 * `slotsAliasOf` follows (BUG-11 §4.4): the alias is scaffolding here, so writing it would
 * raise a second `TS2304` in a stretch no capability routes through — an error the editor
 * drops on the floor and the corpus harness reports as unmapped, which is the invariant «no
 * mute stretch with a diagnostic» broken for nothing. `{}` also happens to be the truth:
 * without a `<link>` nothing is known of the tag's contract, so what may go in its gap is
 * HTML's vocabulary and no prop at all.
 */
function emitGaps(ctx: TemplateContext, el: ElementNode, alias: string): void {
  const known = ctx.aliases.slotsAliasOf(el.name) !== undefined;
  ctx.w.scaffold(`$gap<${known ? alias : '{}'}>({`, el.openSpan);
  // One anchor per gap of the start tag, all standing for the inside of the object literal:
  // this is what makes completion work at `<app-badge |>`, where there is no text yet to map
  // from and the type that knows the answer lives in the projection.
  for (const gap of attributeGaps(el)) ctx.w.projected('\n  ', gap, COMPLETION_ONLY_CAPS);
  ctx.w.scaffold('});\n');
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
function emitEntries(ctx: TemplateContext, entries: readonly Entry[], contract?: string): void {
  for (const { attr, binding } of entries) {
    if (binding.type === 'property' && binding.name.length === 0) {
      ctx.w.projected('\n  ', attr.span, COMPLETION_ONLY_CAPS);
      continue;
    }
    // `control="@f.body"` on a component tag is the `ctrl` prop and nothing else (SDD-34
    // decision 112): the key is the compiler's, so it is scaffolding, and the value is the
    // author's expression, copied verbatim. That is what puts the crossing in front of the
    // child's contract — the node is checked against what the child declared, and the path is
    // checked because it is now code the checker reads.
    if (binding.type === 'control') {
      ctx.w.scaffold('\n  ');
      ctx.w.scaffold(`${CONTROL_PROP}: `, attr.span);
      // Through a call, and not as a bare value in the literal, for the reason `$required`
      // exists: a property mismatch is reported over `ctrl: (…)`, whose two ends fall in two
      // different stretches, and a range only maps back when both land in one. The author
      // would get a correct error that the editor drops on the floor. With the call the whole
      // range is the ARGUMENT, which is the author's own characters — and the type it is
      // checked against is the one the CHILD declared, exactly as §4.9 promises.
      if (contract === undefined) emitExpression(ctx, binding.value);
      else emitCrossing(ctx, binding.value, `$Prop<${contract}, ${JSON.stringify(CONTROL_PROP)}>`, '$node');
      ctx.w.scaffold(',');
      continue;
    }
    // The same key with no value yet. The key is the compiler's either way, so it is
    // scaffolding either way; what changes is that there is no expression to copy, and the
    // hole takes its place — checked against nothing, since an anchor that carries completion
    // alone cannot fail `$Prop<…, 'ctrl'>`.
    const openControl = openControlValue(ctx, attr, binding);
    if (openControl !== undefined) {
      ctx.w.scaffold('\n  ');
      ctx.w.scaffold(`${CONTROL_PROP}: `, attr.span);
      emitHole(ctx, openControl.end);
      ctx.w.scaffold(',');
      continue;
    }
    ctx.w.scaffold('\n  ');
    emitKey(ctx, attr, binding);
    ctx.w.scaffold(': ');
    emitValue(ctx, attr, binding, contract);
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
    emitOpenInterpolation(ctx, binding.value);
  }
}

/**
 * A `@` the author has just typed inside a native attribute's value: `role="@|"`, `href="/a/@|"`.
 *
 * The tokenizer scans a `RazorExpression` only where an identifier begins, so a `@` with nothing
 * behind it is not one — it stays inside the literal text. On a component that case has been
 * handled since BUG-23 by `emitTextValue`; on a native tag nothing handled it, so the loop above
 * found no expression to project and the one position where the names in scope are wanted had
 * nowhere to ask from. Which is why `<div role="@|">` answered with silence while
 * `<div role="@ti|">` answered with the whole template scope.
 *
 * The value ENDS with the `@`, not equals it, and that is the difference from the component
 * path: `href="/name/@|"` is the same question asked one literal further in, and a rule that only
 * knew a lone `@` would leave it out.
 *
 * `$attr()` with an empty argument is an arity error on scaffolding no span maps back to, the
 * same trade `emitOpenHandler` makes: the projection is not a program that has to compile, it is
 * a place to ask questions from.
 */
function emitOpenInterpolation(ctx: TemplateContext, value: readonly AttributeValuePart[]): void {
  const last = value.at(-1);
  if (last?.type !== 'attribute-text' || !openInterpolation(last)) return;

  ctx.w.scaffold('$attr(');
  ctx.w.projected(' ', span(last.span.end, last.span.end), COMPLETION_ONLY_CAPS);
  ctx.w.scaffold(');\n');
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

/**
 * The projection call a `control` on a NATIVE element gets, by what that element is.
 *
 * `controlTarget` is the one classification, shared with the emit and with the semantic pass
 * (`@fudic/compiler`), so the three cannot drift: `false` for `isComponent` because a component
 * tag never reaches here — over there the binding is the `ctrl` prop and the child's own
 * contract does the checking.
 *
 * An element the compiler rejects — `FUD0592`'s two faces — is still projected as a control:
 * the `FUD` is already on the author's screen, and a second complaint about the same three
 * characters, in TypeScript's words, would be the same mistake said twice.
 */
function controlCall(el: ElementNode): string {
  return controlTarget(el, false).kind === 'value' ? '$control(' : '$controlGroup(';
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

  // A `control` still being written, on a NATIVE element. The same trade the open handler
  // above makes, for the same position one binding over: nothing was projected here, so
  // `ownedByProjection` silenced the root — which is right, the list there is the form's
  // nodes and not HTML's vocabulary — and then there was nobody left to answer. The call is
  // projected with a HOLE where the node goes, and the hole is what the checker is asked
  // from. `$control()` one argument short reports to nobody: the anchor carries completion
  // alone and the parenthesis is scaffolding.
  //
  // A component tag is not here for the reason its finished twin is not: over there the
  // binding is the `ctrl` prop, and `emitProps` writes the hole inside the props literal so
  // the question is asked against the contract the CHILD declared.
  const openControl = openControlValue(ctx, attr, binding);
  if (openControl !== undefined && !isComponent(el.name)) {
    ctx.w.scaffold(controlCall(el), attr.span);
    // ZERO-LENGTH at the END of the value, the arithmetic `emitOpenHandler` explains: Volar
    // maps a source offset into a stretch with `Math.min(relativePos, generatedLength)`, so
    // anything wider pushes the caret past the anchor and onto the `)`.
    ctx.w.projected(' ', span(openControl.end, openControl.end), COMPLETION_ONLY_CAPS);
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
      emitHandler(ctx, attr, binding.value);
      ctx.w.scaffold(');\n');
      return;

    case 'bus':
      // The bus name may itself be an expression (decision 28.b); either way the event
      // type is unknowable, so the handler is checked and the event is not.
      ctx.w.scaffold('$on(', attr.span);
      if (typeof binding.eventName === 'string') ctx.w.scaffold(`'${binding.eventName}'`);
      else copyRazor(ctx, binding.eventName);
      ctx.w.scaffold(' as never, ');
      emitHandler(ctx, attr, binding.value);
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

    case 'control':
      // On a NATIVE element only: over a component tag the same binding is the `ctrl` prop,
      // and `emitProps` has already put it in front of the child's contract — projecting it
      // twice would report one mistake twice.
      //
      // What this call buys is the sentence SDD-34 §4.9 rests on: the path is checked by
      // TypeScript and not by the emit, so `@f.seo.descripcion` is a member access that does
      // not resolve. And WHICH call is decided by the element, with the very function the emit
      // picks its bind module with (decision 109): a `<form>` and a `<div>` take a form or a
      // group, an `<input>`/`<textarea>`/`<select>` takes a control. Asking it twice with two
      // functions is how the editor and the build come to disagree about what an element is.
      if (isComponent(el.name)) return;
      ctx.w.scaffold(controlCall(el), attr.span);
      // `copyRazor` and not `copyExpression`, and what separates them is the DANGLING dot. At
      // `control="@f.|"` the `.` is not part of the node's span, so copying the node alone left
      // the caret OUTSIDE the projection: TypeScript was never asked, and the one position where
      // the fields of the form are the whole answer came back empty (decision 102). Every other
      // binding here copies the razor — the crossing into a component included — and this was
      // the one exception.
      copyRazor(ctx, binding.value);
      ctx.w.scaffold(');\n');
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

  // A FINISHED literal is not a handler being written, it is a handler that is wrong:
  // `@click="Hello"` passes a string where a listener goes, and until now the projection
  // dropped it and wrote the anchor, so nothing complained anywhere. Projected as the string
  // it is, `$on` rejects it with `TS2345` over the author's own characters — the quotes
  // included, which is what makes the two ends of the reported range land in one stretch.
  //
  // The generated literal is the same length as the source it stands for, so the mapping is
  // 1:1: `"Hello"` is seven characters either way.
  const literal = finishedLiteral(ctx, attr, value);
  if (literal !== undefined) {
    ctx.w.projected(quote(literal), span(value.start - 1, value.end + 1), DIAGNOSTIC_ONLY_CAPS);
    return;
  }

  ctx.w.projected(' ', span(value.end, value.end), COMPLETION_ONLY_CAPS);
}

/**
 * The value of an event that is one QUOTED literal, and nothing else: `@click="Hello"`.
 *
 * Quoted, because an unquoted one is `FUD0056` already and a type error underneath it would be
 * the same mistake reported twice. Not an open `@`, because that is the author mid-keystroke —
 * the case this whole function exists for. And a single part, because a concatenation is a
 * different shape with a different answer.
 */
function finishedLiteral(
  ctx: TemplateContext,
  attr: Attribute,
  value: Span,
): string | undefined {
  const only = attr.value.length === 1 ? attr.value[0] : undefined;
  if (only?.type !== 'attribute-text' || only.value === '') return undefined;
  if (!quoted(ctx, only) || openInterpolation(only)) return undefined;
  return ctx.source.slice(value.start, value.end);
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
function emitHandler(ctx: TemplateContext, attr: Attribute, value: RazorExpression): void {
  const deferred = handlerShape(rootAt(ctx, value.expr)) === 'call';
  const reads = ctx.delegation.reads.get(attr) ?? [];
  if (reads.length === 0) {
    if (deferred) ctx.w.scaffold('($event) => ');
    copyRazor(ctx, value);
    return;
  }

  // `$day` is written HERE and declared by a loop BELOW, so there is no scope in the
  // projection that holds it — and inventing one out of `unknown` would give the author a
  // name that type-checks against everything. The loop's own header re-opens the exact scope
  // instead: destructuring, defaults and a C-style `@for` all arrive with the type they have
  // inside the body, because it is the same header that gives them that type in the body.
  //
  // Every header the reads need, in source order and each one once. Source order IS nesting
  // order — an enclosing header is written before the one inside it — so opening them like
  // this is what lets `const item of group.rows` name the `group` an outer loop declared.
  //
  // The header text is SCAFFOLDING and not a copy: it is already projected, once, where the
  // author wrote it, and a second mapping over the same characters would make a hover on
  // `days` answerable from two places.
  const byStart = new Map<number, Span>();
  for (const read of reads) for (const at of read.loopHeaders) byStart.set(at.start, at);
  const headers = [...byStart.values()].sort((a, b) => a.start - b.start);

  ctx.w.scaffold('($event) => { ');
  for (const at of headers) {
    ctx.w.scaffold(`for (${ctx.source.slice(at.start, at.end)}) { `);
  }
  // One declaration per NAME and not per read: `@fn($item, $item)` is a handler that reads
  // the same row twice, which is legal, and two `const $item` would be a TS2451 of the
  // projection's own making.
  for (const name of new Set(reads.map((read) => read.name))) {
    ctx.w.scaffold(`const $${name} = ${name}; `);
  }
  ctx.w.scaffold('return ');
  copyRazor(ctx, value);
  ctx.w.scaffold(`; ${'} '.repeat(headers.length)}}`);
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

/**
 * The property value: exact type for a lone expression, `string` for a concatenation.
 *
 * And a value that is not there YET, which is the case the `=` decides. A bare attribute is
 * `true` (decision 44), but `.name=` is not bare — the author wrote the equals sign and stopped,
 * which is the one moment they are asking what may go on the right of it. `attributeValueSpan`
 * tells the two apart, exactly as `emitOpenHandler` uses it to tell `@click` from `@click=`, and
 * the second gets the anchor the first must not have.
 */
function emitValue(
  ctx: TemplateContext,
  attr: Attribute,
  binding: Binding,
  contract?: string,
): void {
  /* c8 ignore next -- emitProps only ever passes 'attr' and 'property' bindings here. */
  if (binding.type !== 'attr' && binding.type !== 'property') return;

  const parts = withoutDangling(binding.value);
  const only = parts.length === 1 ? parts[0]! : undefined;

  // A bare attribute is `true` (decision 44); a lone expression keeps its exact type
  // (decision 24); anything else is a concatenation, checked as a string (decision 20).
  if (parts.length === 0) emitEmptyValue(ctx, attr, binding);
  else if (only?.type === 'razor-expression') {
    // A `.prop` of a KNOWN component naming a reactive is the one place the read is not
    // decided here: what crosses depends on what the child declared, so the question goes to
    // the checker with the child's own type (BUG-24 §4.1). Everywhere else — a native
    // attribute, an unregistered tag — the emit crosses the read and so does this.
    const cell =
      contract !== undefined && binding.type === 'property' && crossesAsRead(ctx, parts)
        ? `$Prop<${contract}, ${JSON.stringify(binding.name)}>`
        : undefined;
    if (cell !== undefined) emitCrossing(ctx, only, cell);
    else emitExpression(ctx, only, crossesAsRead(ctx, parts));
  }
  // A prop whose value the parser already rejected: `FUD0056` is out, and a SECOND error about
  // the same three characters is not a better report. `.id=.` used to project `id: "."`, so
  // TypeScript added «string is not assignable to number» underneath the compiler's own
  // message — two errors, one mistake, and the type one pointing at a `Props` the author had
  // written correctly. A hole is checked against nothing and still answers completion.
  else if (only?.type === 'attribute-text' && binding.type === 'property' && !quoted(ctx, only)) {
    emitHole(ctx, only.span.end);
  } else if (only?.type === 'attribute-text') emitTextValue(ctx, only);
  else emitTemplateLiteral(ctx, parts);
}

/**
 * `.name` → `true`; `.name=` and `.name=""` → a hole to ask from.
 *
 * A PROPERTY only, and that restriction is the whole of it. What goes on the right of a prop's
 * `=` is an expression, so a hole there is a question TypeScript can answer; what goes on the
 * right of `class=` or `slot=` is a literal, and a hole there is TypeScript being asked a
 * question about the wrong language. It answered too — with `arguments`, `AbortController` and
 * every other name in the program, offered inside `<app-circle class="|">`, where a `<div>` was
 * quietly offering the two classes of the file's own `<style>`.
 *
 * It is the same line `bareBindingValueContextAt` draws in the server, and for the same reason:
 * `.prop` and `@event` are fudic's, `class=`, `slot=` and `id=` are HTML's, and the services
 * that own HTML have real answers there.
 *
 * The anchor is ZERO-LENGTH at the END of the value, which is the shape `emitOpenHandler` and
 * `emitEventName` settled on and for their reason: Volar maps a source offset into a stretch
 * with `Math.min(relativePos, generatedLength)`, so a stretch WIDER than a point pushes the
 * caret past the hole and onto the closing parenthesis, where nothing is offered.
 */
function emitEmptyValue(ctx: TemplateContext, attr: Attribute, binding: Binding): void {
  const value = binding.type === 'property' ? attributeValueSpan(ctx.source, attr) : undefined;
  if (value === undefined) {
    // Decision 44: a bare attribute is `true`, and so is one whose value the author left empty.
    ctx.w.scaffold('true', binding.span);
    return;
  }

  emitHole(ctx, value.end);
}

/**
 * `( ⟨anchor⟩ )` — an expression that is not there, at the offset where it would begin.
 *
 * The one shape three cases share: a value left empty, a value the author has just opened with
 * a `@`, and a value the parser rejected. None of them holds a program, all three are a place
 * the editor asks from, and none may be checked against anything — so the anchor carries
 * completion alone.
 */
function emitHole(ctx: TemplateContext, at: number): void {
  ctx.w.scaffold('(');
  // ZERO-LENGTH, and that is arithmetic rather than taste: Volar maps a source offset into a
  // stretch with `Math.min(relativePos, generatedLength)`, so a stretch wider than a point
  // pushes the caret past the hole and onto the closing parenthesis, where nothing is offered.
  ctx.w.projected(' ', span(at, at), COMPLETION_ONLY_CAPS);
  ctx.w.scaffold(')');
}

/**
 * The value's parts with the trailing text dropped when it is only the dangling dot.
 *
 * `.name="@data."` is ONE expression being written, and the parser says so twice: the atom
 * carries `dangling` — the `.` with no name behind it (decision 102) — and the same characters
 * also arrive as the literal run that follows, because for the OUTPUT that dot is text
 * (decision 2). Counting both made the value a concatenation, so it was projected as a
 * template literal, and there the dangling is nobody's: the caret after the dot landed on a
 * literal run with no completion, and the members of `data` were never asked for.
 *
 * Dropping the duplicate makes it the lone expression it is, and `copyRazor` writes the dot —
 * `name: (data.)` — which is the incomplete TypeScript that answers the question. The
 * unquoted form was already doing this, because there the run stops at the `>`; this is what
 * makes the two spellings behave the same.
 */
function withoutDangling(parts: readonly AttributeValuePart[]): readonly AttributeValuePart[] {
  const last = parts.at(-1);
  const previous = parts.at(-2);
  if (last?.type !== 'attribute-text' || previous?.type !== 'razor-expression') return parts;

  const dangling = previous.dangling;
  if (dangling === undefined) return parts;
  // Where it ENDS is the whole question. The run begins where the dot does and cannot begin
  // anywhere else — it is the text that FOLLOWS the expression, and the dot the chain broke on
  // is its first character (decision 101 keeps the two adjacent). So `@data.` is the dot alone
  // and `@data. x` is the dot and a sentence after it, and only the first is the duplicate.
  if (last.span.end !== dangling.end) return parts;

  return parts.slice(0, -1);
}

/** Whether the author wrote quotes around this value part. */
function quoted(ctx: TemplateContext, part: { readonly span: Span }): boolean {
  const before = ctx.source[part.span.start - 1];
  return before === '"' || before === "'";
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
  if (!openInterpolation(only)) {
    ctx.w.scaffold(quote(only.value), only.span);
    return;
  }

  if (only.value === EVENT_PREFIX) {
    ctx.w.scaffold('(');
    ctx.w.projected(' ', span(only.span.end, only.span.end), COMPLETION_ONLY_CAPS);
    ctx.w.scaffold(')');
    return;
  }

  // `.name="hola@|"` — the same `@` one literal further in, and on a component the value still
  // has to typecheck as a string, so the hole goes inside a TEMPLATE literal instead of
  // replacing the whole value. The literal keeps its type, and the position where the names in
  // scope are wanted gets somewhere to ask from.
  ctx.w.scaffold('`');
  emitOpenTail(ctx, only);
  ctx.w.scaffold('`');
}

/**
 * The run of text a `@` was opened at the end of, as `pre${ ⟨anchor⟩ }`.
 *
 * The `@` itself is not copied: it is what the author typed to OPEN the expression, and inside
 * a template literal it would be one more character of the string. What replaces it is the
 * hole the names in scope are asked from — zero-length, at the caret, for completion alone,
 * the shape every other hole in this file uses and for its reason.
 */
function emitOpenTail(
  ctx: TemplateContext,
  part: Extract<AttributeValuePart, { type: 'attribute-text' }>,
): void {
  const text = part.value.slice(0, -1);
  const upto = span(part.span.start, part.span.end - 1);
  if (text.length > 0) ctx.w.scaffold(escapeTemplate(text), upto);
  ctx.w.scaffold('${');
  ctx.w.projected(' ', span(part.span.end, part.span.end), COMPLETION_ONLY_CAPS);
  ctx.w.scaffold('}');
}

/**
 * Whether a value part ends with a `@` the author has just opened.
 *
 * The escape of decision 1 is not one, and the VALUE cannot tell: the parser resolves `@@` to
 * the single character it denotes, so an escaped at-sign and an open one spell the same
 * string. What separates them is the SPAN — the escape stands for two characters of source and
 * the open `@` for one — which is why this takes the part rather than its text. Reading the
 * text alone put a completion hole inside `role="hola@@"`, where the author had written a
 * literal at-sign and asked nothing.
 */
function openInterpolation(part: Extract<AttributeValuePart, { type: 'attribute-text' }>): boolean {
  return (
    part.value.endsWith(EVENT_PREFIX) && part.span.end - part.span.start === part.value.length
  );
}

/**
 * `(expr)` — parenthesized so that a comma or an arrow inside cannot break the object.
 *
 * `read` adds the call the emit adds: `.name="@titulo"` crosses as `titulo()`, so the literal
 * says `name: (titulo()),`. The `()` is SCAFFOLDING and carries no mapping — the author never
 * typed it, so nothing navigates to it, nothing renames through it, and no diagnostic lands
 * on it. What is mapped stays `titulo`, exactly as before.
 */
/**
 * `$cross<$C0['value']>(count)` — a reactive crossing a `.prop` whose form the CHILD decides.
 *
 * The alternative was to read the child's `.fud` from here, and that is exactly what the
 * projection must not do: the contract is already an imported type, and one call hands the
 * checker both readings at once. Against `value: Signal<number>` the object is what fits;
 * against `value?: number` its read is; and against either, a value that is neither — `.value=@42`
 * — is rejected on the author's own characters, which is the editor's half of `FUD0200`.
 *
 * Hover is unchanged and that is criterion 20: `count` is copied 1:1, so hovering it says
 * `Signal<number>` exactly as before.
 */
function emitCrossing(
  ctx: TemplateContext,
  expr: RazorExpression,
  contract: string,
  fn = '$cross',
): void {
  ctx.w.scaffold(`${fn}<${contract}>(`);
  copyRazor(ctx, expr);
  ctx.w.scaffold(')');
}

function emitExpression(ctx: TemplateContext, expr: RazorExpression, read = false): void {
  ctx.w.scaffold('(');
  copyRazor(ctx, expr);
  if (read) ctx.w.scaffold('()');
  ctx.w.scaffold(')');
}

/**
 * `` `pre-${expr}-post` `` — the literal runs escaped, the expressions copied verbatim.
 *
 * And a `@` the author opened at the very end, which reaches here rather than `emitTextValue`
 * whenever the value has more than one part: `.name="/a/@|"` is the run `/a/` followed by the
 * at-sign, so the lone-part rule would leave out exactly the case the rule exists for — a slug
 * being written inside a longer value.
 */
function emitTemplateLiteral(ctx: TemplateContext, parts: readonly AttributeValuePart[]): void {
  const last = parts.at(-1);
  const open = last?.type === 'attribute-text' && openInterpolation(last) ? last : undefined;

  ctx.w.scaffold('`');
  for (const part of parts) {
    if (part === open) {
      emitOpenTail(ctx, open);
      continue;
    }
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
