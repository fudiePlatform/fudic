/**
 * `--in` — wiring by span, not by concatenation (SDD-22 §4.4). Inserting a
 * `<link rel="component">` into a foreign file is the CLI's only write over something the
 * user wrote, so it is an insertion at an exact offset: it does not reformat, does not
 * reorder attributes (decision 47), does not normalize whitespace, and touches no line but
 * the one it adds.
 *
 * The insertion point depends on the document ROLE, and there are four of them, not two:
 * a route carries its links top-level (decision 83) while a page or a layout carries them
 * inside `<head>` (decision 59). Getting this wrong produces a file that still parses and
 * is still wrong, which is the worst kind of wrong.
 */

import type { ElementNode, StructuredDocument } from '@fudic/compiler';
import { staticAttr } from './parse.js';

/** Where the new `<link>` goes, and how deep the line it lands on is indented. */
interface Anchor {
  readonly offset: number;
  readonly indent: string;
}

export function componentLinkTag(href: string): string {
  return `<link rel="component" href="${href}">`;
}

/** `./a.fud` and `a.fud` are the same href; so are `\` and `/` separators. */
function normalizeHref(href: string): string {
  return href.replace(/\\/gu, '/').replace(/^\.\//u, '');
}

/** True when the document already links that href — the idempotency of §4.4.5. */
export function alreadyLinked(doc: StructuredDocument, href: string): boolean {
  const wanted = normalizeHref(href);
  return links(doc).some((link) => {
    const value = staticAttr(link, 'href');
    return value !== null && normalizeHref(value) === wanted;
  });
}

function links(doc: StructuredDocument): readonly ElementNode[] {
  return doc.links;
}

/** The whitespace prefix of the line `offset` sits on. */
function lineIndent(source: string, offset: number): string {
  const start = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  const match = /^[ \t]*/u.exec(source.slice(start, offset));
  return match?.[0] ?? '';
}

/**
 * The anchor for a new component link, by role:
 *
 *  - component: after the last `<link rel="component">`, else offset 0 (decision 53);
 *  - route: after the last component link, else after the `<link rel="layout">` (83);
 *  - page / layout: inside `<head>`, after the last link, else right after `<head>` (59).
 */
export function anchorFor(source: string, doc: StructuredDocument): Anchor {
  const existing = links(doc);
  const last = existing.at(-1);
  if (last !== undefined) return { offset: last.span.end, indent: lineIndent(source, last.span.start) };

  switch (doc.type) {
    case 'component-document':
      return { offset: 0, indent: '' };
    case 'route-document':
      return { offset: doc.layoutLink.span.end, indent: lineIndent(source, doc.layoutLink.span.start) };
    case 'page-document':
    case 'layout-document':
      return {
        offset: doc.head.openSpan.end,
        indent: `${lineIndent(source, doc.head.span.start)}  `,
      };
  }
}

/**
 * The source with the link inserted, or `null` when it is already there (idempotent: no
 * duplicate, no diagnostic, not reported as a modification).
 */
export function wireComponentLink(source: string, doc: StructuredDocument, href: string): string | null {
  if (alreadyLinked(doc, href)) return null;
  const tag = componentLinkTag(href);
  const { offset, indent } = anchorFor(source, doc);
  if (offset === 0) return `${tag}\n${source}`;
  return `${source.slice(0, offset)}\n${indent}${tag}${source.slice(offset)}`;
}
