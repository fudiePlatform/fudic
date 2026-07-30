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
