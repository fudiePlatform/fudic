/**
 * What a `.fud` IS (SDD-24 §4.5, decision 51 and SDD-21).
 *
 * The role is read from the structured document, never from the file name or the folder: a
 * layout is a layout because it has a doctype and one `@RenderBody()`, and `_layout.fud` is
 * a convention of the CLI, not a rule of the language.
 *
 * Pure — the disk enters in the workspace index, which is the only module that reads it.
 */

import type { StructuredDocument } from '@fudic/compiler';

/** The four roles the `href` completion filters by (§4.2). */
export type FudRole = 'component' | 'page' | 'route' | 'layout';

/** The role of a parsed document. */
export function roleOf(document: StructuredDocument): FudRole {
  switch (document.type) {
    case 'component-document':
      return 'component';
    case 'page-document':
      return 'page';
    case 'route-document':
      return 'route';
    default:
      return 'layout';
  }
}

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

/**
 * The `href` of this file's `<link rel="layout">`, or `''` when it declares none.
 *
 * Both a route and a nested layout may declare one (decisions 81, 87); the empty string is
 * also what the parser leaves behind when the `href` is absent or interpolated (FUD0436).
 */
export function layoutHrefOf(document: StructuredDocument): string {
  if (document.type === 'route-document') return document.layoutHref;
  if (document.type === 'layout-document') return document.layoutHref ?? '';
  return '';
}
