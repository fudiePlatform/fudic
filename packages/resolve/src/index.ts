/**
 * `@fudic/resolve` — where an `href` written in a `.fud` points.
 *
 * One implementation of the question, shared by the three hosts that ask it: the Vite
 * plugin, the CLI and the language server (SDD-43 §3.1). Each builds its `ResolveIo.resolve`
 * on `resolveHrefPath`; each reads `resolveHref` when it needs to say WHY something did not
 * resolve.
 *
 * And the other half of the same question: which packages a project DEPENDS on, and which of
 * those declare themselves fudic libraries (§3.2, §4.4). The index needs them with their
 * files, the CLI needs the tags they define and the build needs the chain in order — one
 * walk, because three copies is three answers.
 *
 * It is a package of its own and not a function inside `@fudic/config` because the two
 * answer different questions — one reads a project's `fudic.json`, the other resolves Node
 * modules — and because this is the side that grows: assets named from a package, and the
 * published runtime of SDD-45. `@fudic/config` is a dependency here and is not modified.
 *
 * The compiler is not among the consumers and does not become one: it stays filesystem-free,
 * and `ResolveIo` does not gain a method (SDD-43 §5).
 */

export { nodeResolveFs, nodePackageFs } from './node.js';
export {
  findLibraries,
  dependencyChain,
  owningPackage,
  type FudicPackage,
  type Library,
  type LibraryFs,
  type PackageFs,
} from './libraries.js';
export {
  resolveHref,
  resolveHrefPath,
  hrefKind,
  packageNameOf,
  subpathOf,
  type HrefKind,
  type HrefResolution,
  type LookupFailure,
  type PackageLookup,
  type PackageTarget,
  type ResolveFs,
} from './resolve.js';
