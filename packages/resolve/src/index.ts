/**
 * `@fudic/resolve` — where an `href` written in a `.fud` points.
 *
 * One implementation of the question, shared by the three hosts that ask it: the Vite
 * plugin, the CLI and the language server (SDD-43 §3.1). Each builds its `ResolveIo.resolve`
 * on `resolveHrefPath`; each reads `resolveHref` when it needs to say WHY something did not
 * resolve.
 *
 * It is a package of its own and not a function inside `@fudic/config` because the two
 * answer different questions — one reads a project's `fudic.json`, the other resolves Node
 * modules — and because this is the side that grows: assets named from a package, and the
 * published runtime of SDD-45. `@fudic/config` is a dependency here and is not modified.
 *
 * The compiler is not among the consumers and does not become one: it stays filesystem-free,
 * and `ResolveIo` does not gain a method (SDD-43 §5).
 */

export { nodeResolveFs } from './node.js';
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
