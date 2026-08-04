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
