/**
 * What is under the cursor (SDD-24 §4.2, §6.3–§6.6).
 *
 * The contexts the server answers itself, and nothing else.
 *
 * Two halves, and the split is deliberate. WHERE the cursor is comes from the tree, through
 * `regionAt` (BUG-22): markup, a tag, a value, an expression, TypeScript or CSS. WHAT is being
 * typed there is read from the text before the cursor, because a prefix is typed BEFORE there
 * is anything to parse — at the moment completion is asked for, `class:su` is not an attribute
 * yet and `@fore` is not a construct.
 *
 * What went away with that split is the second half doing the first half's job: every one of
 * these used to scan backwards for a `<` with no `>` after it, and `<div title="a > b"` fooled
 * all of them at once.
 */

import type { Attribute, ElementNode, Region, Span, StructuredDocument } from '@fudic/compiler';
import { EVENT_PREFIX, attributeValueSpan, span } from '@fudic/compiler';

// Reading the quotes of an attribute is parser knowledge, and the parser owns it now.
export { attributeValueSpan };

/** A `<link>` of this file and what it links. */
export interface LinkRef {
  readonly element: ElementNode;
  readonly rel: 'component' | 'layout';
}

/** The cursor sits inside the `href` of a `<link>`. */
export interface HrefContext extends LinkRef {
  /** The value, inside the quotes. Empty span for `href=""` — the interesting case. */
  readonly value: Span;
  readonly text: string;
}

/** A name being typed, with the span it would replace. */
export interface PartialName {
  readonly span: Span;
  readonly text: string;
}

/** Every `<link>` this file declares: the components, plus the layout when it has one. */
export function linksOf(document: StructuredDocument): readonly LinkRef[] {
  const links: LinkRef[] = document.links.map((element) => ({ element, rel: 'component' as const }));

  if (document.type === 'route-document') {
    links.push({ element: document.layoutLink, rel: 'layout' });
  } else if (document.type === 'layout-document' && document.layoutLink !== undefined) {
    links.push({ element: document.layoutLink, rel: 'layout' });
  }
  return links;
}

/** The attribute of this name, if the element has one. */
export function attributeOf(element: ElementNode, name: string): Attribute | undefined {
  return element.attributes.find((attribute) => attribute.name === name);
}

/** The `href` context at this offset, when the cursor is inside one. */
export function hrefContextAt(
  source: string,
  document: StructuredDocument,
  offset: number,
): HrefContext | undefined {
  for (const link of linksOf(document)) {
    const attribute = attributeOf(link.element, 'href');
    if (attribute === undefined) continue;

    const value = attributeValueSpan(source, attribute);
    // Both ends included: an empty `href=""` is a single position, and it is the one the
    // editor asks about.
    if (value === undefined || offset < value.start || offset > value.end) continue;

    return { ...link, value, text: source.slice(value.start, value.end) };
  }
  return undefined;
}

/** A tag name being typed after `<`. */
export function tagContextAt(source: string, offset: number): PartialName | undefined {
  const match = /<([A-Za-z][-\w]*)?$/.exec(source.slice(0, offset));
  if (match === null) return undefined;

  const text = match[1] ?? '';
  return { span: span(offset - text.length, offset), text };
}

/**
 * A bare word being typed, with no `<` in front of it (SDD-28 §5.3).
 *
 * This is how a component tag is actually typed: `app-button`, then Tab. Without it the list
 * of components is unreachable unless the user remembers to open the tag first, which is the
 * one thing an editor is supposed to save them.
 *
 * One guard, and it is the region: a word a `<` opens is `tagContextAt`'s, and a word inside
 * an open tag is an attribute name that the projection answers (SDD-23). The region calls both
 * of those `tag`, so excluding that one kind is the whole rule.
 *
 * It excludes rather than requires `markup` because this is also how a snippet is reached
 * inside `@code`, where the region is `ts`. WHICH words are offered is the caller's question,
 * and it asks the region again for it — the component tags only where markup is.
 *
 * That guard used to be a backwards scan for a `<` with no `>` after it, and a `>` inside an
 * attribute value fooled it (BUG-22): `<div title="a > b" cla|` read as markup and offered
 * component tags where an attribute goes. The parser had tokenized that `>` as part of a
 * quoted value and never had the doubt.
 */
export function wordContextAt(
  source: string,
  offset: number,
  region: Region,
): PartialName | undefined {
  if (region.kind === 'tag') return undefined;

  const match = /([A-Za-z][-\w]*)$/.exec(source.slice(0, offset));
  if (match === null) return undefined;

  const text = match[1] as string;
  return { span: span(offset - text.length, offset), text };
}

/**
 * A class name being typed after `class:` — the fifth exact context (BUG-15 §3, §4.3).
 *
 * The span does NOT include the `class:`, the opposite of `directiveContextAt` with its `@`:
 * there the prefix is replaced, here it is what opens the context and it stays.
 *
 * Three things are not this context, and each needs its own guard because the text alone
 * cannot tell them apart from the real one (§6.2):
 *
 *  - `style:` and `bus:` share the shape and not the answer — their names come from elsewhere
 *    entirely (§7), so only the literal `class:` is recognised;
 *  - a `class:` that is not inside an open tag is markup text, and `<p>class:x</p>` is a
 *    sentence, not an attribute;
 *  - a `class:` inside a quoted attribute value is somebody else's string: `title="class:x"`.
 *
 * The last two are now one question — the region has to be `tag`, which is neither markup nor
 * a value — instead of a backwards scan plus a quote counter (BUG-22).
 */
export function classContextAt(
  source: string,
  offset: number,
  region: Region,
): PartialName | undefined {
  if (region.kind !== 'tag') return undefined;

  const match = /(?:^|[^-\w])class:([-\w]*)$/.exec(source.slice(0, offset));
  if (match === null) return undefined;

  const text = match[1] as string;
  return { span: span(offset - text.length, offset), text };
}

/**
 * An EMPTY position inside a start tag, where another attribute could be typed:
 * `<app-badge |>`, `<app-badge | tone="x">`, `<app-badge na|>`.
 *
 * The context of the whole answer at a gap — the props of the component, the classes of this
 * file, HTML's vocabulary — and like `propertyContextAt` it exists mainly for the SPAN: what an
 * accepted item replaces is the half-written word and nothing more.
 *
 * Three questions decide it, and the first two come from the tree rather than from the text.
 * The region has to be `tag`, which rules out markup and the inside of a quoted value at once.
 * The region must carry NO attribute, which is what makes `@cli|ck` and `class:re|d` somebody
 * else's: an offset inside an attribute belongs to that attribute. And the close tag is not a
 * place an attribute goes, so `</app-badg|e>` is not this either.
 *
 * The third is the text, and it is one rule: the word under the cursor must be preceded by
 * WHITESPACE. That is what separates a gap from every prefix of the grammar without naming any
 * of them — `.na|` is preceded by a dot, `@cli|` by an at-sign, `class:re|` by a colon — and
 * from the tag name itself, `<app-badg|e>`, which is preceded by the `<`. A rule that has to
 * list the prefixes goes stale the day the grammar grows one; this one cannot.
 *
 * A COMPONENT only, and the hyphen is what says so (decision 41). A `<div |>` has no `$gap` in
 * the projection and never did: the list there is HTML's own, answered by the HTML service
 * exactly as it answers a `.html`. What a native tag DOES share with a component is the
 * `class:` binding, and that one is added beside HTML's list rather than in place of it — see
 * `nativeGapContextAt`.
 */
export function attributeGapContextAt(
  source: string,
  offset: number,
  region: Region,
): PartialName | undefined {
  const gap = gapAt(source, offset, region);
  return gap !== undefined && gap.element.name.includes('-') ? gap.name : undefined;
}

/**
 * The same empty position, inside a NATIVE tag: `<div |>`, `<div cla|>`.
 *
 * `class:red` is not a component's, it is the grammar's — decision 28 spells a conditional
 * class on any element — and a `<div>` was the one place it could not be reached by asking.
 * The list there is the HTML service's, which knows nothing of fudic, so this context exists to
 * put the bindings BESIDE it: an additional plugin, merging, never claiming the position.
 */
export function nativeGapContextAt(
  source: string,
  offset: number,
  region: Region,
): PartialName | undefined {
  const gap = gapAt(source, offset, region);
  return gap !== undefined && !gap.element.name.includes('-') ? gap.name : undefined;
}

/** An empty position inside a start tag, whatever the tag is. */
function gapAt(
  source: string,
  offset: number,
  region: Region,
): { readonly name: PartialName; readonly element: ElementNode } | undefined {
  if (region.kind !== 'tag' || region.attribute !== undefined) return undefined;
  const element = region.element;
  /* v8 ignore next -- every `tag` region is built from an element; the guard is for the type. */
  if (element === undefined) return undefined;
  // `</app-badge>` — the region of a close tag, which takes no attributes.
  if (source[region.span.start + 1] === '/') return undefined;

  const match = /([A-Za-z][-\w]*)?$/.exec(source.slice(0, offset));
  const text = match?.[1] ?? '';
  const start = offset - text.length;

  // Past the tag's own name: `<app-badg|e>` is the name being typed, and `tagContextAt` owns it.
  const nameEnd = element.openSpan.start + 1 + element.name.length;
  if (start <= nameEnd) return undefined;
  // `charAt` and not an index: past the name there is always a character behind the caret, and
  // a `?? ''` for the case that cannot happen is a branch no source can take.
  if (!/\s/.test(source.charAt(start - 1))) return undefined;

  return { name: { span: span(start, offset), text }, element };
}

/**
 * A class name inside the value of a plain `class`: `<div class="re|">`, `<div class="red ye|">`.
 *
 * The same list as `class:`, at the other place the grammar spells a class. `class:red` is a
 * BINDING whose name is a class and whose value decides whether it applies; `class="red"` is the
 * plain HTML attribute, a space-separated list of names. Two syntaxes, one vocabulary — the
 * `<style>` of this file — so answering one and not the other was arbitrary, and it is what left
 * `class=""` saying «no suggestions» while `class:` answered.
 *
 * The region does the hard part: `attr-value` is inside the quotes, and it carries the attribute
 * the offset belongs to, so no backwards scan has to guess where the value began. A Razor atom
 * inside the value is region `expression` instead, which is how `class="@(x)"` stays TypeScript's
 * without a guard written for it.
 *
 * What is REPLACED is the word under the cursor and never the whole value: `class="red ye|"` has
 * to keep `red`. A class name cannot contain a space, so the run of name characters behind the
 * caret is exactly the name being typed.
 */
export function classValueContextAt(
  source: string,
  offset: number,
  region: Region,
): PartialName | undefined {
  return attributeValueNameAt(source, offset, region, 'class');
}

/**
 * A slot name inside the value of a `slot`: `<div slot="PE|">`.
 *
 * The list itself is TypeScript's — `$intoSlot<$S_parent>` takes the union of the parent's slot
 * names, so the names come from the component that declares them and no table is kept here. What
 * is NOT TypeScript's is the stretch an accepted name replaces, and that is why this context
 * exists.
 *
 * `emitIntoSlot` projects the name WITH its quotes over a source span that has none, because a
 * `TS2345` is reported over `'PEPITO'` including them and a reported range only maps back when
 * both of its ends land in one stretch. The price is that the stretch is two characters longer
 * than what it stands for, so every offset inside it is shifted — and the range TypeScript hands
 * back for `slot="p|"` came back landing beside the `p` instead of over it. Accepting the item
 * inserted rather than replaced: `pPEPITO`, and a `TS2345` about a name nobody chose.
 *
 * The same defect `emitEventName` fixed for `@cli|` by aligning its stretch 1:1. Here the
 * diagnostic needs the quotes, so the projection keeps them and the SERVER supplies the range —
 * computed from the source, where the name is just a word.
 */
export function slotValueContextAt(
  source: string,
  offset: number,
  region: Region,
): PartialName | undefined {
  return attributeValueNameAt(source, offset, region, 'slot');
}

/**
 * Inside the value of an attribute where an interpolation could be opened, with no `@` yet.
 *
 * Any attribute takes a binding — `role="@data.title"`, `href="/name/@data.slug"` — and that is
 * not a special form, it is what a value IS in fudic. But nothing said so: the names in scope
 * appeared only once the `@` was typed, so a developer had to already know the answer to be able
 * to ask the question. This is the position where they are offered without it, and the item
 * writes the `@` itself.
 *
 * NOT `class` and NOT `slot`: those two have lists of their own here, closed and local, and
 * adding a second vocabulary to them would be noise over a position that already answers well.
 * And not where a `@` is already typed — from there on the position belongs to the projection,
 * whose answer is the same names with the type behind them.
 */
export function attributeValueBindingAt(
  source: string,
  offset: number,
  region: Region,
): PartialName | undefined {
  if (region.kind !== 'attr-value') return undefined;
  const attribute = region.attribute;
  /* v8 ignore next -- an `attr-value` region always carries one; the guard is for the type. */
  if (attribute === undefined) return undefined;
  if (attribute.name === 'class' || attribute.name === 'slot') return undefined;

  const before = source.slice(0, offset);
  // A `@` behind the caret means the expression is open and somebody else owns the answer.
  if (/@[\w$.]*$/.test(before)) return undefined;

  const start = runStart(source, offset, /[\w$]/u);
  return { span: span(start, offset), text: source.slice(start, offset) };
}

/**
 * The word being typed inside the value of one named attribute.
 *
 * A word with a `.` in it is not one: neither a class nor a slot name may hold a dot, so
 * `slot=".` is a value the author has already broken — out of habit from `.prop`, most likely —
 * and the honest answer there is nothing. Offering `PEPITO` was worse than saying nothing: the
 * dot is not part of the run an item replaces, so accepting one wrote `.PEPITO`, a name no
 * component declares and no `<slot>` will ever match.
 *
 * Swallowing the dot into the replaced run does not work either, and the reason is the editor
 * rather than the grammar: VS Code filters the list against the text between the start of an
 * item's range and the caret, so with the dot inside that text every label would be dropped
 * before it reached the list — the same trap `scopeItems` documents for the `@`.
 */
function attributeValueNameAt(
  source: string,
  offset: number,
  region: Region,
  name: string,
): PartialName | undefined {
  if (region.kind !== 'attr-value') return undefined;
  const attribute = region.attribute;
  // `bus:(EVENTOS.x)` names its attribute with an expression, which is nobody's `class`.
  if (attribute === undefined || attribute.name !== name) return undefined;

  const start = runStart(source, offset, /[-\w]/u);
  if (source[start - 1] === '.') return undefined;

  return { span: span(start, offset), text: source.slice(start, offset) };
}

/**
 * Where the run of `re` characters ending at `offset` begins.
 *
 * An index rather than a match, and the difference is that a match has a «did not match» case
 * to pretend to handle: `/([-\w]*)$/` succeeds against every string there is, so the `?? ''`
 * behind it stood for nothing a source could ever be. Walking back has no such case.
 */
function runStart(source: string, offset: number, re: RegExp): number {
  let start = offset;
  while (start > 0 && re.test(source.charAt(start - 1))) start--;
  return start;
}

/**
 * A property name being typed after `.`, and an event name being typed after `@` — the two
 * contexts of BUG-16 §3.4.
 *
 * In fudic a property is written with a dot and an event with an at-sign, and both lists come
 * from TypeScript over the projection: the component's contract for one, `HTMLElementEventMap`
 * for the other. So these two functions exist to do the OPPOSITE of what the other contexts
 * do — they answer nothing. What they contribute is the SPAN: the stretch the accepted item
 * replaces, which is what the user has typed after the prefix and never the prefix itself.
 * Without them the range would come from the projection's own stretch, and that stretch stands
 * for the `.` or the `@`, which would then be eaten.
 *
 * Same three guards as `classContextAt`, for the same reasons: a prefix in markup text is a
 * sentence, one inside a quoted value is somebody else's string, and one that continues a word
 * is neither.
 */
export function propertyContextAt(
  source: string,
  offset: number,
  region: Region,
): PartialName | undefined {
  return prefixedNameAt(source, offset, region, /(?:^|[^-\w.=])\.([-\w]*)$/);
}

export function eventContextAt(
  source: string,
  offset: number,
  region: Region,
): PartialName | undefined {
  // `@@` is the escape of decision 1, never an event.
  return prefixedNameAt(source, offset, region, /(?:^|[^-\w@=])@([-\w]*)$/);
}

/**
 * A value the author opened with a `.`: `<app-circle .name=.|>`, `<div @click=.|>`.
 *
 * The `=` is what makes it broken. Right of it goes an expression, and an expression is opened
 * with a `@` (decision 1) — a `.` there is `FUD0056`, "attribute value must be quoted", and the
 * compiler says so already. What the editor was doing was disagreeing with the compiler: the
 * two regexes above matched that dot and answered with the whole list of props, and the same
 * dot after `@click=` answered with the events. A list where the file is red teaches the
 * opposite of what the error says.
 *
 * Its answer is NOTHING, and that is why it belongs in `ownedByProjection`: silence from the
 * root is not enough on its own — the HTML service would fill it with attribute names, which is
 * the same wrong lesson in another vocabulary.
 */
export function brokenValueContextAt(source: string, offset: number, region: Region): boolean {
  // Every region an unquoted broken value can classify as: the parser degrades `.name=.` to a
  // plain attribute, and whether the offset then reads as `tag` or as that attribute's value
  // depends on how much of the tag is still parseable around it.
  if (region.kind !== 'tag' && region.kind !== 'attr-value' && region.kind !== 'expression') {
    return false;
  }
  // NO quote: `title=".foo"` is a literal string and perfectly legal. What is not is the
  // unquoted `.`, which is exactly what `FUD0056` reports.
  return /=[ \t]*\.[-\w.]*$/.test(source.slice(0, offset));
}

/**
 * A member being reached with a `.` inside an `@` expression: `@data.|`, `@post.author.|`.
 *
 * The third closed position, and the one that was missing. `propertyContextAt` covers the dot
 * that opens a PROP, and its guard is the region `tag`; this one covers the dot that continues
 * an EXPRESSION, where the region is markup or an attribute value. Both belong to TypeScript
 * over the projection — the projection copies the dangling dot on purpose, so `$text(data.)`
 * is a position TypeScript can answer — and both need the server to step aside for it.
 *
 * Without it the position fell through to the last branch of `completions()`, which returns
 * Emmet's list. A non-empty reply from the root CLAIMS the position in Volar, so Emmet
 * answering `@data.` is what kept the members of the route data from ever being offered.
 *
 * The chain is read backwards from the cursor: a name opened by `@`, any number of `.` or `?.`
 * hops, and a trailing dot with nothing typed after it yet. The two guards of
 * `directiveContextAt` apply for the same reasons — a `@` after another `@` is the escape of
 * decision 1, and a `@` after a word character is an email address, not an expression.
 */
export function memberContextAt(
  source: string,
  offset: number,
  region: Region,
): PartialName | undefined {
  const before = source.slice(0, offset);
  const match = /@[A-Za-z_$][\w$]*(?:\??\.[\w$]*)*\??\.$/.exec(before);
  if (match === null) return undefined;

  const at = match.index;
  const preceding = source[at - 1];
  if (preceding === '@' || (preceding !== undefined && /\w/.test(preceding))) return undefined;

  // Inside an open tag the dot usually opens a PROP, and `propertyContextAt` owns that one. The
  // exception is a chain that a `=` opened: `<x .name=@data.|>` is an unquoted value, and the
  // region is `tag` rather than `attr-value` because the caret sits one character past the
  // atom — the dangling dot is not part of its span. Without this the members of `data` were
  // dropped in the one position where the shape is least ambiguous: a `@` follows the `=`, and
  // a prop's dot never does.
  if (region.kind === 'tag' && !/=[ \t]*["']?$/.test(source.slice(0, at))) return undefined;

  // Nothing is typed after the dot yet, so the item replaces an empty stretch at the caret.
  return { span: span(offset, offset), text: '' };
}

/**
 * Whether this position belongs to the projection rather than to any service of the root.
 *
 * The closed positions of the grammar: a prop after `.`, an event after `@`, a member after a
 * `.` in an expression, the handler of an event, and the value of any other binding opened with
 * `@`. In all of them the list is TypeScript's over the virtual file — narrowed by the rules of
 * `ts-completion.ts` — and every other voice is a wrong answer: Emmet's abbreviations, HTML's
 * attribute vocabulary, the component tags.
 *
 * It exists because "the server says nothing here" was not enough. Volar drops a plugin whose
 * list comes back EMPTY and moves on to the next document, and the root is last in that walk —
 * so whenever TypeScript had nothing to offer, HTML filled the silence with its own list. A
 * position that belongs to the projection has to silence the root even when the projection
 * answers with nothing.
 */
export function ownedByProjection(source: string, offset: number, region: Region): boolean {
  return (
    // An empty position inside a COMPONENT tag. The projection answers it whole — the props,
    // the classes of this file and HTML's entire vocabulary, all from `$gap` — so a second
    // voice there is not one more answer, it is the same answer twice. And it was: the HTML
    // service repeated every `aria-*` the moment a letter was typed, with its own icon, while
    // the empty position had never heard from it at all.
    attributeGapContextAt(source, offset, region) !== undefined ||
    propertyContextAt(source, offset, region) !== undefined ||
    eventContextAt(source, offset, region) !== undefined ||
    memberContextAt(source, offset, region) !== undefined ||
    handlerContextAt(source, offset, region) !== undefined ||
    expressionValueContextAt(source, offset, region) !== undefined ||
    // The one whose list is EMPTY rather than TypeScript's, and it belongs here for the same
    // reason as the rest: what makes a position closed is that every other voice is wrong,
    // not that somebody else has the answer.
    bareBindingValueContextAt(source, offset, region) !== undefined ||
    // The other one with no list: a value opened with a `.`, which is an error and not a
    // question.
    brokenValueContextAt(source, offset, region)
  );
}

/** The shared shape: a name typed after a one-character prefix, inside an open tag. */
function prefixedNameAt(
  source: string,
  offset: number,
  region: Region,
  pattern: RegExp,
): PartialName | undefined {
  if (region.kind !== 'tag') return undefined;

  const match = pattern.exec(source.slice(0, offset));
  if (match === null) return undefined;

  const text = match[1] as string;
  return { span: span(offset - text.length, offset), text };
}

/**
 * A directive being typed: `@`, or `@` plus a half-written name (SDD-28 §5.4).
 *
 * The span INCLUDES the `@`, because that is what gets replaced — a completion that inserted
 * `@if` over the name alone would leave `@@if`, which is the escape of decision 1.
 *
 * A `@` that follows another `@` is that escape, and a `@` that follows a word character is
 * text (`hola@ejemplo.com`). Neither is a directive, and neither is offered one.
 *
 * And a `@` INSIDE an open tag is an event, never a directive (BUG-16 §4.4): inside a tag the
 * answer belongs to somebody else, and offering `@if` where an event name goes is not a
 * shorter list — it is the wrong one.
 *
 * A half-written `@fore` parses as an implicit expression, so the region there is
 * `expression`, not `markup` — which is why this one excludes `tag` rather than requiring
 * `markup`. The construct being typed does not exist yet; that is the whole reason this
 * function exists.
 */
export function directiveContextAt(
  source: string,
  offset: number,
  region: Region,
): PartialName | undefined {
  if (region.kind === 'tag') return undefined;

  const match = /@([A-Za-z]\w*)?$/.exec(source.slice(0, offset));
  if (match === null) return undefined;

  const name = match[1] ?? '';
  const at = offset - name.length - 1;
  const before = source[at - 1];
  if (before === '@' || (before !== undefined && /\w/.test(before))) return undefined;

  return { span: span(at, offset), text: `@${name}` };
}

/**
 * Whether the document has nothing in it yet — or nothing but the word being typed.
 *
 * The gate for the document skeletons, and it has to be the content rather than the role: an
 * empty `.fud` structures as a `component-document` with `FUD0156`, because without a doctype
 * and without a `<link rel="layout">` there is nothing else to decide on. Gating on the role
 * would mean the `route` and `layout` skeletons could never be offered at all.
 *
 * The lone word is not a concession, it is the whole case: nobody completes on an empty file
 * without typing something first, and the moment they type `rou` the file stops being empty.
 * A gate that a single keystroke closes is a gate nobody would ever get through.
 */
export function isEmptyDocument(source: string): boolean {
  return /^([A-Za-z][-\w]*)?$/u.test(source.trim());
}

/**
 * The tag name the cursor is inside, in an opening or a closing tag alike.
 *
 * Text again, and for a weaker reason than the two above: the tree does hold the element, but
 * finding the name under an offset in it means a second traversal of everything — the one the
 * semantic tokens already own — while a tag name is two delimiters and a word. The name may be
 * half typed, and both ends of it matter, so it is read outwards from the cursor rather than
 * backwards from it.
 */
export function tagNameAt(source: string, offset: number): PartialName | undefined {
  let start = offset;
  while (start > 0 && /[-\w]/.test(source[start - 1] as string)) start--;
  let end = offset;
  while (end < source.length && /[-\w]/.test(source[end] as string)) end++;
  if (start === end) return undefined;

  // A word is a tag name only when a `<` or a `</` opens it. Nothing else is checked: a name
  // inside a comment answers too, and pointing at the component it names is the right answer.
  const opensTag = source[start - 1] === '<' || (source[start - 1] === '/' && source[start - 2] === '<');
  if (!opensTag) return undefined;

  return { span: span(start, end), text: source.slice(start, end) };
}

/**
 * The HANDLER of an event: the cursor inside the value of an `@name=` binding (BUG-23).
 *
 * `@click=@|` is not an expression like any other. What may go there is a listener, and the
 * only listeners a `.fud` has are the ones its own `@client` declares — so the nine hundred
 * globals TypeScript offers at that offset are all wrong answers, `onabort` included.
 *
 * Text again, and for the reason the whole second half of this module is text: at the instant
 * completion is asked, `@click=@` has no handler to find in the tree — classification degraded
 * it to a plain attribute the moment the expression came out empty. What is left is the shape
 * the author typed, and the shape is unambiguous.
 *
 * The region is the guard, exactly as everywhere else: only inside an attribute's VALUE, so
 * the same characters written in markup text are a sentence rather than a binding.
 */
export function handlerContextAt(
  source: string,
  offset: number,
  region: Region,
): PartialName | undefined {
  if (region.kind !== 'attr-value' && region.kind !== 'expression') return undefined;

  // `@name=`, an optional quote, the `@` that opens the handler, and what has been written of
  // it. A chain is allowed (`@click=@this.onPick`), so the dot is part of the name.
  const match = /@[A-Za-z][-\w]*[ \t]*=[ \t]*["']?@([\w$.]*)$/.exec(source.slice(0, offset));
  if (match === null) return undefined;

  const text = match[1] as string;
  return { span: span(offset - text.length, offset), text };
}

/**
 * The VALUE of a binding, opened with `@`: `.name=@|`, `id="@ti|"`, `class:red=@|`.
 *
 * The fourth closed position. What may go there is an expression over what the TEMPLATE can
 * see — the route's `data`, the props the file destructured, the names its `@client` declares —
 * and nothing else. TypeScript answers with its whole scope at that offset, which is why
 * `arguments`, `atob`, `await` and auto-imports from `@fudic/transport` were being offered
 * where a value goes.
 *
 * NOT the handler of an event: `@click=@` is `handlerContextAt`, whose list is narrower still
 * (only what can be a listener). Callers ask that one first, so this one is everything else.
 *
 * The span INCLUDES the `@`, the way `directiveContextAt` does, because the `@()` snippet
 * offered here replaces it — completing `@(…)` over the name alone would leave `@@(…)`, the
 * escape of decision 1.
 */
export function expressionValueContextAt(
  source: string,
  offset: number,
  region: Region,
): PartialName | undefined {
  if (region.kind !== 'attr-value' && region.kind !== 'expression') return undefined;

  const name = openedName(source, offset, region);
  if (name === undefined) return undefined;

  return { span: span(offset - name.length - 1, offset), text: `@${name}` };
}

/**
 * What has been written of an expression opened with a `@` inside the value under the cursor,
 * or nothing when no `@` is open there.
 *
 * Two readings, and the first is the one that matters: the value the REGION carries, read from
 * where it begins up to the caret. A `@` may be opened anywhere inside it — `href="/a/@|"` is a
 * URL with a slug in it, and `rel="preload"` is where that gets written — so anchoring on the
 * `=` describes only the shortest case. Anchoring on the value describes every one of them, and
 * costs nothing extra: the parser already knows where the quotes are.
 *
 * Without it the position fell through to «TypeScript's whole scope», which is 984 names —
 * `arguments`, `AbortController`, `alert` — offered where the template's four belong. The list
 * was right about the program and wrong about the language.
 *
 * The fallback is the old rule, and it stays because the region cannot always name an
 * attribute: `bus:(EVENTS.cart)` writes its name as an expression, and a value the parser could
 * not delimit has no span to read from.
 */
function openedName(source: string, offset: number, region: Region): string | undefined {
  const attribute = region.attribute;
  const value = attribute === undefined ? undefined : attributeValueSpan(source, attribute);

  if (value !== undefined && offset >= value.start) {
    // The `@` that opens it: preceded by the start of the value or by anything that is neither
    // a word character — `hola@ejemplo.com` is an address — nor another `@`, which is the
    // escape of decision 1. A trailing `.` is a member access and belongs to
    // `memberContextAt`, which is why the tail is word characters only.
    const inValue = /(?:^|[^@\w])@([\w$]*)$/.exec(source.slice(value.start, offset));
    return inValue?.[1];
  }

  // An attribute name — `.prop`, `id`, `class:red`, `bus:cart` — its `=`, an optional quote,
  // the `@` that opens the expression, and what has been written of it.
  return /[.@\w:-]+[ \t]*=[ \t]*["']?@([\w$]*)$/.exec(source.slice(0, offset))?.[1];
}

/** The value of a prop or an event with no `@` typed yet, and which of the two it is. */
export interface BareBindingValue extends PartialName {
  /** An event (`@click=`), whose value has to be a listener rather than any expression. */
  readonly event: boolean;
}

/**
 * The value of a prop or an event with NO `@` typed yet: `.name=|`, `.name=r|`, `@click=j|`.
 *
 * The position where the author has committed to a value and written none of it, which is the
 * one moment they are asking what may go there. In fudic that is an expression over what the
 * TEMPLATE can see, opened with a `@` — so the names are offered WITH the `@` in front, because
 * the author has not typed one and accepting `data` bare would write `.name=data`, which is a
 * literal and not the read they asked for.
 *
 * It used to answer NOTHING, on the rule that until the `@` is there nothing has been said. That
 * rule described the grammar correctly and served the developer badly: the `@` is precisely what
 * an editor is for. What it did fix stays fixed — before it, the two positions answered
 * differently and both wrong, `.name=r` reaching the HTML service for `role` and `@click=j`
 * reaching TypeScript's global scope for `JSON`.
 *
 * Only `.prop` and `@event`, and the restraint is deliberate: `class=`, `slot=` and `id=` are
 * HTML's own attributes, where the HTML and CSS services have real answers and a `@` is not
 * required to be about to be typed.
 */
export function bareBindingValueContextAt(
  source: string,
  offset: number,
  region: Region,
): BareBindingValue | undefined {
  if (region.kind !== 'attr-value' && region.kind !== 'expression') return undefined;

  // A name opened by `.` or `@`, its `=`, an optional quote, and what has been written of the
  // value. The tail excludes `@` on purpose: once one is there the position belongs to
  // `handlerContextAt` or `expressionValueContextAt`, whose lists are real. And it cannot BEGIN
  // with a `.`: `.name=.` is `FUD0056`, not a value being typed — see `brokenValueContextAt`.
  const match = /([.@])[\w-]*[ \t]*=[ \t]*["']?([\w$][\w$.]*|)$/.exec(source.slice(0, offset));
  if (match === null) return undefined;

  const text = match[2] as string;
  return { span: span(offset - text.length, offset), text, event: match[1] === EVENT_PREFIX };
}

/** A section name being typed after `@section `. */
export function sectionContextAt(source: string, offset: number): PartialName | undefined {
  const match = /@section[ \t]+([A-Za-z_$][\w$]*)?$/.exec(source.slice(0, offset));
  if (match === null) return undefined;

  const text = match[1] ?? '';
  return { span: span(offset - text.length, offset), text };
}
