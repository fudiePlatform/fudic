/**
 * Where an `href` written in a `.fud` points (SDD-43 §3.1, §4.3).
 *
 * ONE implementation, three hosts. The Vite plugin, the CLI and the language server each
 * build their `ResolveIo.resolve` on this: three copies of a module-resolution algorithm is
 * three answers the day one of them falls behind, and the editor and the build disagreeing
 * about which file a tag is costs a day to find.
 *
 * The I/O is injected, as everywhere else in this repo, and **nothing here throws**. A
 * specifier that does not resolve comes back as an outcome with a reason, because the two
 * reasons need two different messages: a package that is not installed is `pnpm add`, and a
 * package that does not export the file is its `package.json`. One message for both sends
 * the author to read the wrong file (§4.3).
 */

import { readProjectConfig, type ProjectConfig } from '@fudic/config';
import { hrefKind, packageNameOf, subpathOf } from './specifier.js';

/** Why a package specifier did not resolve. */
export type LookupFailure = 'not-installed' | 'not-exported';

/** What the host's module resolver answered. */
export type PackageLookup =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly reason: LookupFailure };

/**
 * The host filesystem, narrowed to what resolving needs.
 *
 * `resolvePackage` is deliberately NOT ours: it is the host handing over the resolver that
 * Node, the bundler and the editor already use, so the answer agrees with what each of them
 * believes. What this module owns is everything around it — which hrefs are packages, which
 * package a specifier names, and what the package turns out to be.
 */
export interface ResolveFs {
  exists(path: string): boolean;
  read(path: string): string;
  /** Join a path written in `fromPath` to an absolute one, the way that host spells paths. */
  join(fromPath: string, href: string): string;
  /** Resolve a BARE specifier as an `import` written in `fromPath` would. */
  resolvePackage(specifier: string, fromPath: string): PackageLookup;
  /** The directory of `path`. */
  dirname(path: string): string;
}

/** The package an href reached, once it is known to be one. */
export interface PackageTarget {
  /** As written in its `package.json`, which is how the author named it. */
  readonly name: string;
  /** Absolute path of the package root — the directory holding its `package.json`. */
  readonly root: string;
  /** Its `fudic.json`, or `null` when it has none. `kind` is what `FUD0763` reads. */
  readonly config: ProjectConfig | null;
}

/**
 * Where an href landed.
 *
 * `path` and `package` both carry a `path`, and every consumer that only wants the file
 * reads that one field — which is what lets `ResolveIo.resolve` stay a `string`.
 */
export type HrefResolution =
  | { readonly outcome: 'path'; readonly path: string }
  | { readonly outcome: 'package'; readonly path: string; readonly target: PackageTarget }
  | { readonly outcome: 'external'; readonly href: string }
  | { readonly outcome: 'unresolved'; readonly specifier: string; readonly reason: LookupFailure };

/**
 * Resolve `href` as written inside `fromPath`.
 *
 * Relative and absolute resolve against the file, as they always did — SDD-43 adds a form,
 * it does not replace the one that is there, and a project that never names a package sees
 * no change at all.
 */
export function resolveHref(fromPath: string, href: string, io: ResolveFs): HrefResolution {
  const kind = hrefKind(href);
  if (kind === 'external') return { outcome: 'external', href };
  if (kind === 'path') return { outcome: 'path', path: io.join(fromPath, href) };

  const lookup = io.resolvePackage(href, fromPath);
  if (!lookup.ok) return { outcome: 'unresolved', specifier: href, reason: lookup.reason };

  return { outcome: 'package', path: lookup.path, target: targetOf(href, lookup.path, io) };
}

/**
 * The path an href names, for a caller that only wants the file.
 *
 * An href that does not resolve still has to answer something, because `ResolveIo.resolve`
 * returns a `string` and the compiler walks the graph with it (SDD-15). The answer is the
 * href joined to the directory — a path that does not exist, which is what the compiler
 * already does with any broken link, so the graph walk degrades exactly as it did before
 * instead of gaining a second kind of failure. The diagnostic is the host's, and it is
 * `FUD0760`.
 */
export function resolveHrefPath(fromPath: string, href: string, io: ResolveFs): string {
  const resolution = resolveHref(fromPath, href, io);
  switch (resolution.outcome) {
    case 'path':
    case 'package':
      return resolution.path;
    case 'external':
      return io.join(fromPath, href);
    case 'unresolved':
      return io.join(fromPath, href);
  }
}

/**
 * The package a resolved file belongs to: the nearest ancestor with a `package.json`.
 *
 * Asking the resolver for `<pkg>/package.json` would be the short way and it is wrong — a
 * package that publishes `exports` need not export its own manifest, and most do not. Going
 * up from the file is what a package manager does, and it answers for every layout: a
 * symlinked workspace member, a copy under `node_modules`, or a store with hard links.
 */
function targetOf(specifier: string, path: string, io: ResolveFs): PackageTarget {
  const declared = packageNameOf(specifier);
  const root = packageRootOf(path, io);
  if (root === null) {
    // Resolved to a file that belongs to no package. Nothing here can say more than the
    // name the author wrote, and a caller reading `config` gets the same `null` it would
    // get from a package with no `fudic.json`.
    return { name: declared, root: io.dirname(path), config: null };
  }
  return { name: declared, root, config: readProjectConfig(root, io).config };
}

/** Walk up from `path` to the nearest directory with a `package.json`. `null` if none. */
function packageRootOf(path: string, io: ResolveFs): string | null {
  let dir = io.dirname(path);
  for (;;) {
    if (io.exists(`${dir}/package.json`)) return dir;
    const parent = io.dirname(dir);
    if (parent === dir) return null; // the filesystem root answers itself
    dir = parent;
  }
}

export { hrefKind, packageNameOf, subpathOf } from './specifier.js';
export type { HrefKind } from './specifier.js';
