/**
 * The one completion that does not delegate, and its diagnostic (SDD-24 §4.2).
 *
 * No language service knows what a `<link rel="component">` means, so this is the server's
 * own: the `.fud` of the workspace in relative paths, filtered by ROLE — `rel="component"`
 * offers components and `rel="layout"` offers layouts (decision 51). An `href` that resolves
 * to nothing is `FUD0460` over the attribute value, with a code action that creates the file
 * the user clearly meant to write.
 */

import type { Diagnostic, Span } from '@fudic/compiler';
import { hrefUnresolved } from '../diagnostics.js';
import { relativeHref, resolveFrom } from '../paths.js';
import type { FudRole } from '../mode.js';
import type { WorkspaceIndex } from '../workspace-index.js';
import type { CachedDocument } from '../document-cache.js';
import { attributeOf, attributeValueSpan, linksOf, type HrefContext } from './position.js';

/** One candidate for an `href`. */
export interface HrefCompletion {
  /** How it is written from the file being edited: always `./` or `../`. */
  readonly href: string;
  readonly path: string;
  readonly role: FudRole;
  /** The tag it defines, for a component. */
  readonly tag: string;
}

/** An `href` that points at no file of the workspace. */
export interface UnresolvedHref {
  readonly href: string;
  /** The attribute value, which is what the diagnostic underlines and the action replaces. */
  readonly value: Span;
  /** Where the file would have to be created. */
  readonly target: string;
}

/** The role a `rel` may point at. */
function roleFor(rel: HrefContext['rel']): FudRole {
  return rel === 'layout' ? 'layout' : 'component';
}

/**
 * The candidates for the `href` under the cursor.
 *
 * The file itself never appears: a component that links itself is not a completion, it is a
 * cycle (FUD0422 territory).
 */
export function hrefCompletions(
  document: CachedDocument,
  index: WorkspaceIndex,
  context: HrefContext,
): readonly HrefCompletion[] {
  return index
    .byRole(roleFor(context.rel))
    .filter((entry) => entry.path !== document.path)
    .map((entry) => ({
      href: relativeHref(document.path, entry.path),
      path: entry.path,
      role: entry.role,
      tag: entry.tag,
    }))
    .sort((a, b) => a.href.localeCompare(b.href));
}

/** Every `href` of this file that resolves to nothing. */
export function unresolvedHrefs(
  document: CachedDocument,
  index: WorkspaceIndex,
): readonly UnresolvedHref[] {
  const unresolved: UnresolvedHref[] = [];

  for (const link of linksOf(document.document)) {
    const attribute = attributeOf(link.element, 'href');
    if (attribute === undefined) continue;

    const value = attributeValueSpan(document.source, attribute);
    // An `href` with no value is FUD0436's business (absent or interpolated), not this rule's:
    // there is nothing to resolve and nothing to underline.
    if (value === undefined || value.start === value.end) continue;

    const href = document.source.slice(value.start, value.end);
    if (index.resolve(document.path, href) !== undefined) continue;

    unresolved.push({ href, value, target: resolveFrom(document.path, href) });
  }
  return unresolved;
}

/** `FUD0460` for each unresolved `href`. */
export function hrefDiagnostics(
  document: CachedDocument,
  index: WorkspaceIndex,
): readonly Diagnostic[] {
  return unresolvedHrefs(document, index).map((unresolved) =>
    hrefUnresolved(unresolved.href, unresolved.value),
  );
}
