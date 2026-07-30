/**
 * What has to be inside the .vsix (SDD-25 §4.5, criterion 11).
 *
 * Installing the extension must not require installing anything else. The failure mode is
 * quiet and specific: a `.vscodeignore` pattern that also matches something needed produces
 * a package that installs, activates, and then does nothing at all — and the file it is
 * missing is never mentioned anywhere.
 *
 * This asks `vsce ls` what would be packaged, which needs no zip reader and no install.
 * It is plain JavaScript because it is build tooling, not part of the extension: `src/` is
 * typechecked and measured, and a script that never ships should not be either.
 *
 * Not a Vitest spec on purpose — it depends on `pnpm build` having run, and a test that
 * fails on a clean checkout for a reason unrelated to the code is a test people learn to
 * ignore. It runs before the SDD closes.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REQUIRED = [
  ['the extension bundle', 'dist/extension.cjs'],
  ['the bundled server', 'dist/server.mjs'],
  ['the grammar', 'syntaxes/fudic.tmLanguage.json'],
  ['the language configuration', 'language-configuration.json'],
  ['the light icon', 'icons/fud-light.svg'],
  ['the dark icon', 'icons/fud-dark.svg'],
  ['the manifest', 'package.json'],
  ['the parser loader', 'dist/node_modules/oxc-parser/src-js/bindings.js'],
];

/**
 * The native parser binary, whatever this platform's is called.
 *
 * Checked as a pattern rather than a name because the file is per target, and its absence
 * is the failure this whole script exists for: the server starts, dies on its first parse,
 * and the editor simply shows nothing.
 */
const REQUIRED_BINDING = /^dist\/node_modules\/@oxc-parser\/binding-[^/]+\/parser\..+\.node$/;

/**
 * Nothing here should ever ship: source, tests, or the colour corpus.
 *
 * `node_modules/` is anchored on purpose — `dist/node_modules/` is not the dependency tree,
 * it is the vendored parser, and it has to travel.
 */
const FORBIDDEN = [/^src\//, /^test\//, /^bundle\//, /^fixtures\//, /^node_modules\//, /^[^/]*\.ts$/];

const cwd = fileURLToPath(new URL('..', import.meta.url));
const listed = execFileSync('pnpm', ['exec', 'vsce', 'ls', '--no-dependencies'], {
  cwd,
  encoding: 'utf8',
  shell: process.platform === 'win32',
})
  .split(/\r?\n/)
  .map((line) => line.trim().replaceAll('\\', '/'))
  .filter((line) => line !== '');

const problems = [];

for (const [what, path] of REQUIRED) {
  if (!listed.includes(path)) problems.push(`missing ${what}: ${path}`);
}
if (!listed.some((path) => REQUIRED_BINDING.test(path))) {
  problems.push('missing the native parser binding: dist/node_modules/@oxc-parser/binding-*/*.node');
}
for (const path of listed) {
  const rule = FORBIDDEN.find((pattern) => pattern.test(path));
  if (rule !== undefined) problems.push(`should not ship: ${path} (matches ${String(rule)})`);
}

if (problems.length > 0) {
  console.error(`vsix verification failed (${String(listed.length)} files listed):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`vsix verified: ${String(listed.length)} files, every required entry present, native binding included.`);
