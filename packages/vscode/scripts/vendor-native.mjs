/**
 * Puts the NAPI addons and their native bindings next to the bundled server (SDD-25 §4.5).
 *
 * Two of them travel: `oxc-parser`, which every `.fud` goes through, and `oxfmt` (SDD-26),
 * which lays out the JS and the CSS inside one. Both are NAPI addons, and a `.node` file
 * cannot be bundled: their loaders resolve the binary with `require('./<pkg>.<target>.node')`
 * or `require('@<scope>/binding-<target>')`, and a bundler rewrites both into something that
 * resolves to nothing. The failure is loud but late — the server dies on its first parse or
 * its first format, and the editor just shows no diagnostics, or never formats.
 *
 * So both stay external and are vendored into `dist/node_modules/`, which is where Node looks
 * when resolving from `dist/server.mjs`. That works with no `node_modules` in the package and
 * no install step, which is what criterion 11 asks for.
 *
 * **The consequence is that the `.vsix` is platform-specific.** The bindings shipped are the
 * ones installed on the machine that packaged it, so releases go out per target
 * (`vsce package --target win32-x64`, …) — the mechanism VS Code has for exactly this.
 */

import { createRequire } from 'node:module';
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const vendor = join(root, 'dist', 'node_modules');

/**
 * Each addon, resolved from the package that DECLARES it, never from here.
 *
 * `oxc-parser` belongs to the compiler and `oxfmt` to the formatter; this package declares
 * neither. pnpm exposes no phantom dependencies, and adding them here just to copy files
 * would duplicate two pinned versions that must not drift. Resolving from the owner
 * guarantees the binding vendored is the one the server will load.
 */
const ADDONS = [
  { name: 'oxc-parser', scope: '@oxc-parser', owner: '../../compiler/package.json' },
  { name: 'oxfmt', scope: '@oxfmt', owner: '../../formatter/package.json' },
];

/** Where a package lives, and which of its optional bindings this platform actually has. */
function locate({ name, owner }) {
  const fromOwner = createRequire(new URL(owner, import.meta.url));
  const packageRoot = dirname(fromOwner.resolve(`${name}/package.json`));
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

  /**
   * The binding for *this* machine: the one optional dependency that actually resolves.
   *
   * Resolved from the addon itself, not from its owner. The bindings are its optional
   * dependencies, so under pnpm they are linked into its own `node_modules` and nowhere else
   * — which is also exactly how its loader will look for them at runtime.
   */
  const fromPackage = createRequire(join(packageRoot, 'package.json'));
  const binding = Object.keys(manifest.optionalDependencies ?? {}).find((dependency) => {
    try {
      fromPackage.resolve(`${dependency}/package.json`);
      return true;
    } catch {
      return false;
    }
  });

  if (binding === undefined) return { packageRoot, binding: undefined, bindingRoot: undefined };
  return {
    packageRoot,
    binding,
    bindingRoot: dirname(fromPackage.resolve(`${binding}/package.json`)),
  };
}

const located = ADDONS.map((addon) => ({ ...addon, ...locate(addon) }));
const missing = located.filter((addon) => addon.binding === undefined);

if (missing.length > 0) {
  for (const addon of missing) {
    console.error(`no ${addon.scope} binding is installed for this platform; nothing to vendor.`);
  }
  process.exit(1);
}

rmSync(vendor, { recursive: true, force: true });

for (const addon of located) {
  mkdirSync(join(vendor, addon.scope), { recursive: true });
  // `dereference` matters: pnpm's tree is symlinks, and a symlink into a store that the target
  // machine does not have is a package that installs and then cannot resolve anything.
  cpSync(addon.packageRoot, join(vendor, addon.name), { recursive: true, dereference: true });
  cpSync(addon.bindingRoot, join(vendor, addon.binding), { recursive: true, dereference: true });
  console.log(`vendored ${addon.name} and ${addon.binding} into dist/node_modules.`);
}
