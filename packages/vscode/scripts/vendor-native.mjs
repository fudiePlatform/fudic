/**
 * Puts `oxc-parser` and its native binding next to the bundled server (SDD-25 §4.5).
 *
 * The parser is a NAPI addon, and a `.node` file cannot be bundled: its loader resolves the
 * binary with `require('./parser.<target>.node')` or `require('@oxc-parser/binding-<target>')`,
 * and a bundler rewrites both into something that resolves to nothing. The failure is loud
 * but late — the server exits on its first parse, and the editor just shows no diagnostics.
 *
 * So `oxc-parser` stays external and is vendored into `dist/node_modules/`, which is where
 * Node looks when resolving from `dist/server.mjs`. That works with no `node_modules` in the
 * package and no install step, which is what criterion 11 asks for.
 *
 * **The consequence is that the `.vsix` is platform-specific.** The binding shipped is the
 * one installed on the machine that packaged it, so releases go out per target
 * (`vsce package --target win32-x64`, …) — the mechanism VS Code has for exactly this.
 */

import { createRequire } from 'node:module';
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const vendor = join(root, 'dist', 'node_modules');

/**
 * Resolved from `@fudic/compiler`, not from here.
 *
 * `oxc-parser` is a dependency of the compiler and this package does not declare it — pnpm
 * exposes no phantom dependencies, and adding it here just to copy files would duplicate a
 * pinned version that must not drift. Resolving from the package that actually declares it
 * guarantees the binding vendored is the one the server will load.
 */
const require = createRequire(new URL('../../compiler/package.json', import.meta.url));

const parserRoot = dirname(require.resolve('oxc-parser/package.json'));
const parserManifest = JSON.parse(readFileSync(join(parserRoot, 'package.json'), 'utf8'));

/**
 * The binding for *this* machine: the one optional dependency that actually resolves.
 *
 * Resolved from `oxc-parser` itself, not from the compiler. The bindings are its optional
 * dependencies, so under pnpm they are linked into its own `node_modules` and nowhere else
 * — which is also exactly how the parser's loader will look for them at runtime.
 */
const fromParser = createRequire(join(parserRoot, 'package.json'));
const binding = Object.keys(parserManifest.optionalDependencies ?? {}).find((name) => {
  try {
    fromParser.resolve(`${name}/package.json`);
    return true;
  } catch {
    return false;
  }
});

if (binding === undefined) {
  console.error('no @oxc-parser binding is installed for this platform; nothing to vendor.');
  process.exit(1);
}

const bindingRoot = dirname(fromParser.resolve(`${binding}/package.json`));

rmSync(vendor, { recursive: true, force: true });
mkdirSync(join(vendor, '@oxc-parser'), { recursive: true });

// `dereference` matters: pnpm's tree is symlinks, and a symlink into a store that the target
// machine does not have is a package that installs and then cannot resolve anything.
cpSync(parserRoot, join(vendor, 'oxc-parser'), { recursive: true, dereference: true });
cpSync(bindingRoot, join(vendor, binding), { recursive: true, dereference: true });

console.log(`vendored oxc-parser and ${binding} into dist/node_modules.`);
