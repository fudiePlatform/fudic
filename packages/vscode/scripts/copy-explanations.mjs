/**
 * Puts every code's explanation (`FUDnnnn.md`) next to the bundled server.
 *
 * The editor's "Explain FUDnnnn" action opens that file in the markdown preview, so it has to
 * be on disk inside the `.vsix`. The server looks for it in `codes/` beside its own bundle —
 * `dist/codes/` here — which is what `explanationsDir()` answers when it runs bundled.
 *
 * Resolved from the package that DECLARES `@fudic/diagnostics` (the language server), never
 * from here: this package does not depend on it, and pnpm exposes no phantom dependencies.
 */

import { createRequire } from 'node:module';
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const target = join(root, 'dist', 'codes');

const fromServer = createRequire(new URL('../../language-server/package.json', import.meta.url));
const diagnostics = dirname(fromServer.resolve('@fudic/diagnostics/package.json'));
const source = join(diagnostics, 'src', 'codes');

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
const explanations = readdirSync(source).filter((name) => name.endsWith('.md'));
for (const name of explanations) cpSync(join(source, name), join(target, name));

console.log(`copy-explanations: ${explanations.length} explanations → dist/codes/`);
