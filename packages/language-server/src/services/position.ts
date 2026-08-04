/**
 * What is under the cursor (SDD-24 §4.2, §6.3–§6.6).
 *
 * The three contexts the server answers itself, and nothing else. Two of them are read from
 * the AST — an `href` is an attribute of a `<link>`, and the tree knows it. The other two are
 * read from the text before the cursor, because `<` and `@section ` are typed BEFORE there is
 * anything to parse: at the moment completion is asked for, the construct does not exist yet.
 * Recognising exactly two prefixes is a smaller commitment than a second tokenizer.
 */

import type { Attribute, ElementNode, Span, StructuredDocument } from '@fudic/compiler';
import { span } from '@fudic/compiler';

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

/**
 * The span of an attribute's value, inside the quotes.
 *
 * Derived from the attribute's own span rather than from its value parts, because the case
 * that matters most has none: `href=""` is where completion is asked for, and an empty parts
 * list cannot say where the quotes were.
 */
export function attributeValueSpan(source: string, attribute: Attribute): Span | undefined {
  const raw = source.slice(attribute.span.start, attribute.span.end);
  const equals = raw.indexOf('=');
  if (equals === -1) return undefined;

  const afterEquals = attribute.span.start + equals + 1;
  const quote = raw.slice(equals + 1).match(/^\s*(["'])/);
  if (quote === null) return span(afterEquals, attribute.span.end);

  const start = afterEquals + quote[0].length;
  const closed = source[attribute.span.end - 1] === quote[1];
  return span(start, closed ? attribute.span.end - 1 : attribute.span.end);
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
 * Two guards, and both are why this is not simply "any word":
 *
 *  - a word that a `<` opens is `tagContextAt`'s, not this one's;
 *  - a word INSIDE an open tag is an attribute name, and attributes are answered by the
 *    projection (SDD-23). Being inside is read by scanning back for a `<` before a `>` — the
 *    same class of textual rule as the two contexts above. A `>` inside an attribute value
 *    fools it, and the cost of being fooled is a component offered where an attribute was
 *    meant: a wrong suggestion in a list, never a wrong edit.
 */
export function wordContextAt(source: string, offset: number): PartialName | undefined {
  const match = /([A-Za-z][-\w]*)$/.exec(source.slice(0, offset));
  if (match === null) return undefined;

  const text = match[1] as string;
  const start = offset - text.length;
  if (source[start - 1] === '<') return undefined;
  if (insideOpenTag(source, start)) return undefined;

  return { span: span(start, offset), text };
}

/** Whether `offset` sits between a `<` and its `>`. */
function insideOpenTag(source: string, offset: number): boolean {
  for (let i = offset - 1; i >= 0; i--) {
    const c = source[i];
    if (c === '>') return false;
    if (c === '<') return true;
  }
  return false;
}

/**
 * A directive being typed: `@`, or `@` plus a half-written name (SDD-28 §5.4).
 *
 * The span INCLUDES the `@`, because that is what gets replaced — a completion that inserted
 * `@if` over the name alone would leave `@@if`, which is the escape of decision 1.
 *
 * A `@` that follows another `@` is that escape, and a `@` that follows a word character is
 * text (`hola@ejemplo.com`). Neither is a directive, and neither is offered one.
 */
export function directiveContextAt(source: string, offset: number): PartialName | undefined {
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
