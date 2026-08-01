/**
 * Builds, verifies, packages and installs the extension into the local VS Code.
 *
 * This is "Install the .vsix" from `EXTENSION-DEV.md` — using Fudic while working on
 * something else — in one command. The four steps belong together: packaging without
 * building the dependencies produces a `.vsix` around a stale `dist`, and installing without
 * `verify:vsix` produces one that installs, activates and then quietly does nothing.
 *
 * It is plain JavaScript for the same reason as its siblings in this folder: build tooling
 * never ships, so it is neither bundled nor measured.
 *
 * Not a `install` script on purpose. That name is an npm/pnpm lifecycle hook, and it would
 * run on every `pnpm install` of the workspace — repackaging and reinstalling the extension
 * when all anyone asked for was to install dependencies.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const vsix = join(cwd, 'fudic-vscode.vsix');

/** Windows resolves `pnpm` and `code` as `.cmd` shims, which `execFile` will not run on its own. */
const shell = process.platform === 'win32';

function run(what, file, args) {
  console.log(`\n> ${what}: ${file} ${args.join(' ')}`);
  try {
    execFileSync(file, args, { cwd, stdio: 'inherit', shell });
  } catch {
    console.error(`\n${what} failed. Nothing was installed.`);
    process.exit(1);
  }
}

/**
 * The `code` CLI, checked before the build rather than after it.
 *
 * It is the one prerequisite that is missing often and costs the most to discover late: the
 * build and the packaging take a while, and finding out at the last step that the shim was
 * never added to the `PATH` wastes all of it.
 */
try {
  execFileSync('code', ['--version'], { cwd, stdio: 'ignore', shell });
} catch {
  console.error('the `code` command is not on your PATH, so the extension cannot be installed.');
  console.error("In VS Code: Ctrl+Shift+P -> \"Shell Command: Install 'code' command in PATH\".");
  process.exit(1);
}

// `fudic-vscode...` is the package AND its dependencies: the two bundles are built from the
// `dist` of the compiler, the language core and the server, never from their sources.
run('build', 'pnpm', ['--filter', 'fudic-vscode...', 'build']);
run('verify', 'pnpm', ['exec', 'node', 'scripts/verify-vsix.mjs']);
run('package', 'pnpm', ['exec', 'vsce', 'package', '--no-dependencies', '--out', 'fudic-vscode.vsix']);
// `--force` overwrites the installed version without uninstalling it first.
run('install', 'code', ['--install-extension', vsix, '--force']);

console.log('\nfudic-vscode installed. Reload the VS Code window (Ctrl+R) and open any .fud.');
