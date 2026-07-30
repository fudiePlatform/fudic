/**
 * Tag completion and document links (SDD-24 §3.2, §6.4).
 *
 * A declared tag is not an HTML tag and must not look like one: the HTML service offers the
 * native elements, and this offers the components this file declared with `<link>`, in a group
 * of their own. Everything about them — attributes, types, go-to-definition — is TypeScript's
 * over the projection of SDD-23; only their EXISTENCE is knowledge this package has.
 */

import type { Span } from '@fudic/compiler';
import { linkHref } from '@fudic/compiler';
import type { CachedDocument } from '../document-cache.js';
import type { WorkspaceIndex } from '../workspace-index.js';
import { attributeOf, attributeValueSpan, linksOf } from './position.js';

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
