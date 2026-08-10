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
import { attributeValueSpan, span } from '@fudic/compiler';

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
  return prefixedNameAt(source, offset, region, /(?:^|[^-\w.])\.([-\w]*)$/);
}

export function eventContextAt(
  source: string,
  offset: number,
  region: Region,
): PartialName | undefined {
  // `@@` is the escape of decision 1, never an event.
  return prefixedNameAt(source, offset, region, /(?:^|[^-\w@])@([-\w]*)$/);
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

/** A section name being typed after `@section `. */
export function sectionContextAt(source: string, offset: number): PartialName | undefined {
  const match = /@section[ \t]+([A-Za-z_$][\w$]*)?$/.exec(source.slice(0, offset));
  if (match === null) return undefined;

  const text = match[1] ?? '';
  return { span: span(offset - text.length, offset), text };
}
