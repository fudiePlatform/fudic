/**
 * Tag completion and document links (SDD-24 §3.2, §6.4).
 *
 * A declared tag is not an HTML tag and must not look like one: the HTML service offers the
 * native elements, and this offers the components this file declared with `<link>`, in a group
 * of their own. Everything INSIDE the tag — its attributes and their types — is TypeScript's
 * over the projection of SDD-23; the tag itself is this package's, because that is where the
 * knowledge lives: which tags exist, and which file each one came from.
 */

import type { Span } from '@fudic/compiler';
import { linkHref } from '@fudic/compiler';
import type { CachedDocument } from '../document-cache.js';
import type { WorkspaceIndex } from '../workspace-index.js';
import { attributeOf, attributeValueSpan, linksOf, tagNameAt } from './position.js';

/** A component this file may write as an element. */
export interface TagCompletion {
  readonly tag: string;
  /** The href it was declared with, as written. */
  readonly href: string;
  readonly path: string;
}

/** A clickable `href`. */
export interface DocumentLinkRef {
  /** The attribute value: what the editor underlines. */
  readonly span: Span;
  /** Absolute path of the file it opens. */
  readonly target: string;
}

/**
 * The tags this file declared, in declaration order.
 *
 * Order is the `<link>` order, not alphabetical: the user wrote them in the order they think
 * about them, and a completion list that reorders them is a list they have to read.
 */
export function declaredTags(
  document: CachedDocument,
  index: WorkspaceIndex,
): readonly TagCompletion[] {
  const tags: TagCompletion[] = [];

  for (const link of document.document.links) {
    const href = linkHref(link);
    if (href === undefined) continue;

    const entry = index.resolve(document.path, href);
    if (entry === undefined || entry.tag === '') continue;

    tags.push({ tag: entry.tag, href, path: entry.path });
  }
  return tags;
}

/** A component tag under the cursor, and the file that defines it. */
export interface TagDefinitionRef {
  /** The tag name, without the delimiters: what the editor underlines as the origin. */
  readonly span: Span;
  /** Absolute path of the `.fud` that defines the component. */
  readonly target: string;
}

/**
 * The file the tag at this offset is defined in (§6.7).
 *
 * F12 over `<app-badge>` cannot come from the projection: the tag is projected as a type name
 * under the diagnostics-only profile — an error must land on it, a navigation must not, or
 * renaming a tag would rename an alias the user never wrote — so nothing routes there. The
 * answer is the `<link>` that declared it, which is knowledge this package has and TypeScript
 * does not.
 */
export function tagDefinitionAt(
  document: CachedDocument,
  index: WorkspaceIndex,
  offset: number,
): TagDefinitionRef | undefined {
  const name = tagNameAt(document.source, offset);
  if (name === undefined) return undefined;

  const declared = declaredTags(document, index).find((item) => item.tag === name.text);
  // A native element, or a tag whose `<link>` is missing: FUD0191 already says so.
  return declared === undefined ? undefined : { span: name.span, target: declared.path };
}

/** Every `href` of this file that resolves, as a link the editor can follow. */
export function documentLinks(
  document: CachedDocument,
  index: WorkspaceIndex,
): readonly DocumentLinkRef[] {
  const links: DocumentLinkRef[] = [];

  for (const link of linksOf(document.document)) {
    const attribute = attributeOf(link.element, 'href');
    if (attribute === undefined) continue;

    const span = attributeValueSpan(document.source, attribute);
    if (span === undefined || span.start === span.end) continue;

    const entry = index.resolve(document.path, document.source.slice(span.start, span.end));
    // An unresolved href gets FUD0460 and a code action, not a link to nowhere.
    if (entry === undefined) continue;

    links.push({ span, target: entry.path });
  }
  return links;
}
