/**
 * What an `href` is, decided from the string alone (SDD-43 §4.3).
 *
 * No I/O and no `node:path`: this is the classification the three hosts have to agree on
 * before anybody touches a disk, and it is the half of the answer that a test can state
 * without building a filesystem.
 */

/**
 * The three shapes an `href` can have.
 *
 * `path` covers both the explicitly relative (`./x.fud`, `../y.fud`) and the absolute, which
 * behave the same from here on: they name a location, and resolving them is arithmetic.
 * `package` is everything else. `external` is a URL, which this resolver does not own.
 */
export type HrefKind = 'path' | 'package' | 'external';

/** `http:`, `data:` — a scheme of two characters or more, so a drive letter is not one. */
const SCHEME = /^[a-z][a-z0-9+.-]+:/iu;

/** `C:/…`, `c:\…` — a single letter before the colon, which no scheme has. */
const DRIVE = /^[A-Za-z]:[\\/]/u;

/**
 * Classify an `href`.
 *
 * Order is the whole of it, because three of these tests overlap:
 *
 * - `//cdn…` is protocol-relative and goes FIRST, or the absolute-path test would eat it;
 * - `\\server\share` is a UNC path and is not protocol-relative, which is why the two
 *   separators are not treated as one thing;
 * - `C:/…` is a drive and not a scheme, which is tested for explicitly and then again by
 *   the scheme pattern, which needs two characters before the colon.
 */
export function hrefKind(href: string): HrefKind {
  if (href.startsWith('//')) return 'external';
  if (href.startsWith('./') || href.startsWith('../')) return 'path';
  if (href.startsWith('/') || href.startsWith('\\')) return 'path';
  if (DRIVE.test(href)) return 'path';
  if (SCHEME.test(href)) return 'external';
  return 'package';
}

/**
 * The package a bare specifier names: `@acme/ui/card.fud` → `@acme/ui`, `ui-kit/card.fud`
 * → `ui-kit`.
 *
 * A scoped name is two segments and an unscoped one is a single segment, which is npm's
 * rule and not ours. A specifier that is only the package (`@acme/ui`) names it whole.
 */
export function packageNameOf(specifier: string): string {
  const parts = specifier.split('/');
  const segments = specifier.startsWith('@') ? 2 : 1;
  return parts.slice(0, segments).join('/');
}

/**
 * What the specifier asks the package for, in the spelling `exports` uses: `'.'` for the
 * package itself, `'./card.fud'` for a subpath.
 */
export function subpathOf(specifier: string): string {
  const rest = specifier.slice(packageNameOf(specifier).length);
  return rest === '' ? '.' : `.${rest}`;
}
