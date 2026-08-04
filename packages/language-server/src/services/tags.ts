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
import {
  alreadyLinked,
  componentLinkAnchor,
  componentLinkTag,
  linkHref,
  span,
} from '@fudic/compiler';
import type { CachedDocument } from '../document-cache.js';
import { relativeHref } from '../paths.js';
import type { WorkspaceIndex } from '../workspace-index.js';
import { attributeOf, attributeValueSpan, linksOf, tagNameAt } from './position.js';

/** A component this file may write as an element. */
export interface TagCompletion {
  readonly tag: string;
  /** The href it was declared with, or the one that would have to be written for it. */
  readonly href: string;
  readonly path: string;
  /** `false` when the component exists in the workspace but this file does not link it. */
  readonly linked: boolean;
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

    tags.push({ tag: entry.tag, href, path: entry.path, linked: true });
  }
  return tags;
}

/**
 * Every component this file MAY write as an element (SDD-28 §5.3).
 *
 * Two groups, and the difference between them is an edit. The ones this file linked are in
 * scope already; the rest exist in the workspace and are offered too, because the alternative
 * is that the user has to know they exist, go up to write the `<link>`, and come back. What
 * makes that safe is that accepting one carries its `<link>` along.
 *
 * The file itself never appears — a component that links itself is a cycle — and neither does
 * a workspace component whose tag is already in scope: two files defining the same tag is a
 * conflict, and offering the second one would be offering to create it.
 */
export function componentTags(
  document: CachedDocument,
  index: WorkspaceIndex,
): readonly TagCompletion[] {
  const declared = declaredTags(document, index);
  const inScope = new Set(declared.map((item) => item.tag));

  const unlinked = index
    .byRole('component')
    .filter((entry) => entry.path !== document.path && entry.tag !== '' && !inScope.has(entry.tag))
    .map((entry) => ({
      tag: entry.tag,
      href: relativeHref(document.path, entry.path),
      path: entry.path,
      linked: false,
    }))
    .sort((a, b) => a.tag.localeCompare(b.tag));

  // Declaration order first — the user wrote those in the order they think about them — and
  // then the rest, alphabetically, because nothing about the workspace suggests an order.
  return [...declared, ...unlinked];
}

/** An edit that adds a `<link rel="component">` to this file. */
export interface LinkInsertion {
  /** Empty span: an insertion point, not a replacement. */
  readonly span: Span;
  readonly newText: string;
}

/**
 * The edit that brings `href` into scope, or nothing when it is already there.
 *
 * The anchor and the idempotency are the compiler's (`componentLinkAnchor`, `alreadyLinked`),
 * which is the same pair `fudic g component --in` writes with. What is local here is turning
 * them into an insertion: an empty span plus the text, which is what an `additionalTextEdits`
 * is made of.
 */
export function linkInsertionFor(
  document: CachedDocument,
  href: string,
): LinkInsertion | undefined {
  if (alreadyLinked(document.document, href)) return undefined;

  const { offset, indent } = componentLinkAnchor(document.source, document.document);
  const tag = componentLinkTag(href);
  // At offset 0 there is nothing above to hang off, so the line goes first and the newline
  // after it; anywhere else the link opens a new line below the node it follows.
  const newText = offset === 0 ? `${tag}\n` : `\n${indent}${tag}`;
  return { span: span(offset, offset), newText };
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
