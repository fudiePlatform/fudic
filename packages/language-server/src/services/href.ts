/**
 * The one completion that does not delegate, and its diagnostic (SDD-24 §4.2).
 *
 * No language service knows what a `<link rel="component">` means, so this is the server's
 * own: the `.fud` this file can link, filtered by ROLE — `rel="component"` offers components
 * and `rel="layout"` offers layouts (decision 51) — and the three `rel` that make a `<link>`
 * one of fudic's, so the author never has to remember them. An `href` that resolves
 * to nothing is `FUD0460` over the attribute value, with a code action that creates the file
 * the user clearly meant to write.
 */

import type { Diagnostic, ElementNode, Span } from '@fudic/compiler';
import { hrefUnresolved } from '../diagnostics.js';
import { resolveFrom } from '../paths.js';
import { isUndecided, type FudRole } from '../mode.js';
import type { WorkspaceIndex } from '../workspace-index.js';
import type { CachedDocument } from '../document-cache.js';
import { attributeOf, attributeValueSpan, linksOf, type HrefContext } from './position.js';

/** One candidate for an `href`. */
export interface HrefCompletion {
  /**
   * How it is written from the file being edited: `./` or `../` inside its own package, the
   * package's name for a file of a library it depends on.
   */
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

/** A `rel` fudic reads, and what it tells the author. */
export interface RelCompletion {
  readonly rel: HrefContext['rel'];
  readonly detail: string;
}

/**
 * The `rel` values this `<link>` may take, in the order they are most often written.
 *
 * `layout` only in a route (decision 81: a layout cannot name one, a component or a page has
 * none) and only while the route names no other — a second is `FUD0420`. Whether the file IS
 * a route is the structure's answer, and a route is recognised by its `<link rel="layout">`:
 * the file being started, whose first `<link>` has no `rel` yet, structures as a component.
 * That one has no tag of its own yet, so it may still become either.
 */
export function relCompletions(document: CachedDocument, link: ElementNode): readonly RelCompletion[] {
  const values: RelCompletion[] = [{ rel: 'component', detail: 'import a component' }];
  if (namesLayout(document, link)) {
    values.push({ rel: 'layout', detail: 'the layout this route renders inside' });
  }
  values.push({ rel: 'snippet', detail: 'import the snippets of a file' });
  return values;
}

/** Whether this `<link>` may be the layout of its file. */
function namesLayout(document: CachedDocument, link: ElementNode): boolean {
  const structured = document.document;
  if (isUndecided(structured)) return true;
  if (structured.type !== 'route-document') return false;
  // An absent layout link is a placeholder with an empty span.
  const named = structured.layoutLink.span;
  return named.start === named.end || named.start === link.span.start;
}

/** The role a `rel` may point at. */
function roleFor(rel: HrefContext['rel']): FudRole {
  if (rel === 'layout') return 'layout';
  return rel === 'snippet' ? 'snippet' : 'component';
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
  const hrefTo = index.linker(document.path);
  const completions: HrefCompletion[] = [];
  for (const entry of index.byRole(roleFor(context.rel))) {
    if (entry.path === document.path) continue;
    // Another project of the same folder, or a file its library does not export.
    const href = hrefTo(entry.path);
    if (href === undefined) continue;
    completions.push({ href, path: entry.path, role: entry.role, tag: entry.tag });
  }
  return completions.sort((a, b) => a.href.localeCompare(b.href));
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
