/**
 * What a `.fud` IS (SDD-24 §4.5, decision 51 and SDD-21).
 *
 * The role is read from the structured document, never from the file name or the folder: a
 * layout is a layout because it has a doctype and one `@RenderBody()`, and `_layout.fud` is
 * a convention of the CLI, not a rule of the language.
 *
 * Pure — the disk enters in the workspace index, which is the only module that reads it.
 *
 * The three facts the typecheck needs too — the tag, the layout `href`, the holes — live in
 * `@fudic/typecheck`; what is here is what only the editor asks.
 */

import type { StructuredDocument } from '@fudic/compiler';

/** The roles the `href` completion filters by (§4.2), one per kind of file (SDD-29 §4.9). */
export type FudRole = 'component' | 'page' | 'route' | 'layout' | 'snippet';

/** The role of a parsed document. */
export function roleOf(document: StructuredDocument): FudRole {
  switch (document.type) {
    case 'component-document':
      return 'component';
    case 'page-document':
      return 'page';
    case 'route-document':
      return 'route';
    case 'snippet-document':
      return 'snippet';
    default:
      return 'layout';
  }
}

/**
 * Whether the file has not said yet what it is.
 *
 * A route is recognised by its `<link rel="layout">` and a component by its own tag, so a file
 * being started — a `<link>` with no `rel` yet, some markup — has neither and structures as a
 * component with no name. It may still become a route, which is the one thing that matters to
 * whoever offers it a layout.
 */
export function isUndecided(document: StructuredDocument): boolean {
  return document.type === 'component-document' && document.name === '';
}

/**
 * The sections a layout declares with `@RenderSection`, in source order.
 *
 * Only a layout declares any: a route FILLS sections, it does not declare them. A directive
 * whose argument was not an identifier (FUD0433) carries an empty name and is dropped — it
 * would complete to nothing.
 */
export function sectionsOf(document: StructuredDocument): readonly string[] {
  if (document.type !== 'layout-document') return [];
  return document.renderSections.map((section) => section.name).filter((name) => name !== '');
}

/** One `@snippet` a file declares, as a `@render` elsewhere sees it. */
export interface SnippetSignature {
  readonly name: string;
  /** The parameter list as written, parentheses included. */
  readonly signature: string;
}

/** The snippets a file declares, in source order — any role may declare them (SDD-29). */
export function snippetsOf(source: string, document: StructuredDocument): readonly SnippetSignature[] {
  return document.snippets
    .filter((s) => s.name !== '')
    .map((s) => ({ name: s.name, signature: source.slice(s.signatureSpan.start, s.signatureSpan.end) }));
}

// The contract moved to `@fudic/typecheck`, which the editor and the build share; the editor
// keeps reading it from here.
export {
  contractOf,
  unstarred,
  type Contract,
  type ContractProp,
} from '@fudic/typecheck/contract';
