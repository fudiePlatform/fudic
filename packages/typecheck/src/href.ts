/**
 * An `href` that resolves to nothing (SDD-24 §4.2): `FUD0460` over the attribute value.
 *
 * The editor also offers a code action that creates the file the author clearly meant to
 * write, which is why the unresolved links are exported with their target and not only as
 * diagnostics.
 */

import { API_EXTENSION } from '@fudic/api';
import { attributeValueSpan, type Diagnostic, type Span } from '@fudic/compiler';
import { FUD0460, FUD0760, FUD1111 } from '@fudic/diagnostics';
import { packageNameOf } from '@fudic/resolve';
import type { LinkIndex } from './link-index.js';
import { attributeOf, linksOf, type LinkRef } from './links.js';
import { resolveFrom } from './paths.js';
import type { ProjectedFud } from './project.js';

/** An `href` that points at no file of the workspace. */
export interface UnresolvedHref {
  readonly href: string;
  /** The attribute value, which is what the diagnostic underlines and the action replaces. */
  readonly value: Span;
  /** Where the file would have to be created. */
  readonly target: string;
  /** What kind of `<link>` it is written on, and the whole element. */
  readonly link: LinkRef;
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
    if (resolves(link, href, document.path, index)) continue;

    unresolved.push({ href, value, target: resolveFrom(document.path, href), link });
  }
  return unresolved;
}

/**
 * Whether the `href` of this link points at its file. A `<link rel="server">` names a
 * `.fudapi`, which no index of `.fud` holds: its own question answers it, and an `href` that is
 * not a `.fudapi` at all is the structure's `FUD1111`, not a missing file. An index that cannot
 * read contracts leaves them be.
 */
function resolves(link: LinkRef, href: string, from: string, index: LinkIndex): boolean {
  if (link.rel !== 'server') return index.resolve(from, href) !== undefined;
  if (!href.endsWith(API_EXTENSION) || index.server === undefined) return true;
  return index.server(from, href) !== undefined;
}

/**
 * A diagnostic for each unresolved `href`: `FUD1111` for a contract, over the whole link as
 * the build says it; `FUD0760` for a package specifier, which knows whether the fix is an
 * install or the library's `exports`; and `FUD0460` for a path.
 */
export function hrefDiagnostics(document: ProjectedFud, index: LinkIndex): readonly Diagnostic[] {
  return unresolvedHrefs(document, index).map(({ href, value, link }) => {
    if (link.rel === 'server') return FUD1111({ span: link.element.span, href, problem: 'not-found' });
    const reason = index.failure(document.path, href);
    if (reason === undefined) return FUD0460({ span: value, href });
    const params = { file: document.path, span: value, href };
    // The file is the one being checked, which a source diagnostic leaves unsaid.
    const { file: _file, ...diagnostic } =
      reason === 'not-installed'
        ? FUD0760({ ...params, reason })
        : FUD0760({ ...params, reason, pkg: packageNameOf(href) });
    return { ...diagnostic, span: value };
  });
}
