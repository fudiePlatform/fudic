/**
 * Where a new `<link rel="component">` goes (SDD-28 §3.3).
 *
 * The rule is the document's, not any one tool's: a route carries its links top-level
 * (decision 83) while a component carries them before everything else (53) and a page or a
 * layout carries them inside `<head>` (59). It lived in `@fudic/cli`, which was the only
 * writer; with the editor writing the same link on completion, two copies of this would
 * diverge in silence, so it lives where the structure it derives from lives.
 *
 * Pure: an offset and an indent, never a write. What to do with them belongs to the caller —
 * the CLI splices a string, the language server emits a `TextEdit`.
 */

import type { ElementNode } from '../html/index.js';
import type { StructuredDocument } from './nodes.js';

/** Where the new `<link>` goes, and how deep the line it lands on is indented. */
export interface LinkAnchor {
  readonly offset: number;
  readonly indent: string;
}

/** The `<link>` itself. One definition, so the CLI and the editor write the same bytes. */
export function componentLinkTag(href: string): string {
  return `<link rel="component" href="${href}">`;
}

/** `./a.fud` and `a.fud` are the same href; so are `\` and `/` as separators. */
function normalizeHref(href: string): string {
  return href.replace(/\\/gu, '/').replace(/^\.\//u, '');
}

/**
 * The value of an attribute, or `null` when any part of it is interpolated.
 *
 * Strict on purpose: `href="./a@(x).fud"` is not a href anybody can compare, and treating the
 * interpolation as empty text would make it match a file that has nothing to do with it.
 */
function staticAttribute(element: ElementNode, name: string): string | null {
  const attribute = element.attributes.find((candidate) => candidate.name === name);
  if (attribute === undefined) return null;

  let text = '';
  for (const part of attribute.value) {
    if (part.type !== 'attribute-text') return null;
    text += part.value;
  }
  return text;
}

/**
 * Whether the document already links this href.
 *
 * The idempotency both writers need: the CLI's `--in` does not duplicate a link, and neither
 * does the editor when the same component is accepted twice (SDD-22 §4.4.5, SDD-28 §5.3).
 */
export function alreadyLinked(doc: StructuredDocument, href: string): boolean {
  const wanted = normalizeHref(href);
  return doc.links.some((link) => {
    const value = staticAttribute(link, 'href');
    return value !== null && normalizeHref(value) === wanted;
  });
}

/**
 * The whitespace prefix of the line `offset` sits on.
 *
 * Scanned rather than matched with a regular expression: `^[ \t]*` always matches, so the
 * "no match" arm of a regex version is a branch no test can ever take.
 */
function lineIndent(source: string, offset: number): string {
  const start = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  let end = start;
  while (end < offset && (source[end] === ' ' || source[end] === '\t')) end++;
  return source.slice(start, end);
}

/**
 * The anchor for a new component link, by role:
 *
 *  - component: after the last `<link rel="component">`, else offset 0 (decision 53);
 *  - route: after the last component link, else after the `<link rel="layout">` (83);
 *  - page / layout: inside `<head>`, after the last link, else right after `<head>` (59).
 */
export function componentLinkAnchor(source: string, doc: StructuredDocument): LinkAnchor {
  const last = doc.links.at(-1);
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
