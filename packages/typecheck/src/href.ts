/**
 * An `href` that resolves to nothing (SDD-24 §4.2): `FUD0460` over the attribute value.
 *
 * The editor also offers a code action that creates the file the author clearly meant to
 * write, which is why the unresolved links are exported with their target and not only as
 * diagnostics.
 */

import { attributeValueSpan, type Diagnostic, type Span } from '@fudic/compiler';
import { FUD0460 } from '@fudic/diagnostics';
import type { LinkIndex } from './link-index.js';
import { attributeOf, linksOf } from './links.js';
import { resolveFrom } from './paths.js';
import type { ProjectedFud } from './project.js';

/** An `href` that points at no file of the workspace. */
export interface UnresolvedHref {
  readonly href: string;
  /** The attribute value, which is what the diagnostic underlines and the action replaces. */
  readonly value: Span;
  /** Where the file would have to be created. */
  readonly target: string;
}

/** Every `href` of this file that resolves to nothing. */
export function unresolvedHrefs(document: ProjectedFud, index: LinkIndex): readonly UnresolvedHref[] {
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
export function hrefDiagnostics(document: ProjectedFud, index: LinkIndex): readonly Diagnostic[] {
  return unresolvedHrefs(document, index).map((unresolved) =>
    FUD0460({ span: unresolved.value, href: unresolved.href }),
  );
}
