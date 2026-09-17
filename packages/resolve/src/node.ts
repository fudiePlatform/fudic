/**
 * The node-backed `ResolveFs` — the only module here that touches a disk.
 *
 * Package resolution is delegated to Node's own resolver rather than reimplemented, which
 * is the point of SDD-43 §3.1: the answer has to agree with what the bundler, `node` and
 * the editor each already believe about a specifier. `exports` maps, scopes and all the
 * rules that come with them are Node's business, and a second implementation of them is a
 * second set of answers.
 *
 * Nothing here throws. A resolution that fails comes back as a reason.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve as resolvePath } from 'node:path';
import { packageNameOf } from './specifier.js';
import type { PackageLookup, ResolveFs } from './resolve.js';

/**
 * Node's code for «the package publishes `exports` and this subpath is not in it».
 *
 * It is the half of the failure the author cannot guess: the package IS there, and the fix
 * is its `package.json`, not an install.
 */
const NOT_EXPORTED = 'ERR_PACKAGE_PATH_NOT_EXPORTED';

/** The real filesystem, narrowed to what resolving needs. */
export function nodeResolveFs(): ResolveFs {
  return {
    exists: (path) => existsSync(path),
    read: (path) => readFileSync(path, 'utf8'),
    join: (fromPath, href) => resolvePath(dirname(fromPath), href),
    dirname: (path) => dirname(path),
    resolvePackage: (specifier, fromPath) => lookup(specifier, fromPath),
  };
}

/**
 * Resolve a bare specifier as an `import` written in `fromPath` would.
 *
 * `createRequire` and not `import.meta.resolve`: resolving has to happen FROM the file that
 * wrote the href, and `import.meta.resolve` only takes a second argument behind a flag.
 * The difference that remains is the condition — this picks `require` where a bundler would
 * pick `import` — and it costs nothing here, because what a fudic library exports is a
 * `.fud` source file and a conditional map for one of those would have nothing to vary.
 */
function lookup(specifier: string, fromPath: string): PackageLookup {
  const require = createRequire(fromPath);
  try {
    return { ok: true, path: require.resolve(specifier) };
  } catch (error) {
    // `require.resolve` fails in exactly one way: an `Error` carrying a `code`. There is no
    // guard around the read because there is no second shape to guard against, and a branch
    // nothing can take is a branch no test can cover.
    if ((error as NodeJS.ErrnoException).code === NOT_EXPORTED) {
      return { ok: false, reason: 'not-exported' };
    }
    // Everything else is `MODULE_NOT_FOUND`, which Node reports both for a package that is
    // absent and for one that is present without the file. Only the disk can tell those
    // apart, and the answer is what decides which of the two messages FUD0760 gives.
    return {
      ok: false,
      reason: isInstalled(packageNameOf(specifier), fromPath) ? 'not-exported' : 'not-installed',
    };
  }
}

/**
 * Whether `name` is installed for `fromPath`: a `node_modules/<name>` with a manifest, in
 * any ancestor directory.
 *
 * Asking the resolver instead would not answer — a package that publishes `exports` need
 * not export its own `package.json`, and then «is it installed» and «does it export this»
 * fail identically.
 */
function isInstalled(name: string, fromPath: string): boolean {
  let dir = dirname(fromPath);
  for (;;) {
    if (existsSync(resolvePath(dir, 'node_modules', name, 'package.json'))) return true;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}
