/**
 * What a `.fud` declares to whoever links it, as far as the check needs it (SDD-24 §4.5).
 *
 * Read from the structured document, never from the file name or the folder. Only the three
 * facts the projection and the rules use live here — the tag a component defines, the layout a
 * route names and the holes a layout opens. Everything else the editor reads about a file (its
 * role for completion, its contract for the card) stays in the editor.
 */

import type { LayoutHoles, StructuredDocument } from '@fudic/compiler';

/**
 * The tag a file defines, or `''` when it defines none.
 *
 * Only a component owns a tag: its markup IS its own tag wrapping the shadow template
 * (decision 75). A page, a route and a layout are reached by URL or by `<link>`, never by
 * being written as an element.
 */
export function tagOf(document: StructuredDocument): string {
  return document.type === 'component-document' ? document.name : '';
}

/** A layout's holes (SDD-48); no hole at all for anything that is not a layout. */
export function holesOf(document: StructuredDocument): LayoutHoles {
  if (document.type !== 'layout-document') return { renderSections: [] };
  return {
    renderSections: document.renderSections,
    ...(document.renderBody !== undefined ? { renderBody: document.renderBody } : {}),
  };
}

/**
 * The `href` of this ROUTE's `<link rel="layout">`, or `''` when there is none to have.
 *
 * Only a route declares one (decision 81, `FUD0439`); the empty string is also what the
 * parser leaves behind when the `href` is absent or interpolated (FUD0436).
 */
export function layoutHrefOf(document: StructuredDocument): string {
  return document.type === 'route-document' ? document.layoutHref : '';
}
