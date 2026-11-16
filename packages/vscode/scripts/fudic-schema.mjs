/**
 * Writes the JSON Schema of `fudic.json` next to the bundles (SDD-83 §3.11): `dist/fudic.schema.json`,
 * which `contributes.jsonValidation` registers for every `fudic.json` of the workspace.
 *
 * Generated on every build and never committed: the keys of `diagnostics` are the live codes of the
 * catalogue and the ids of `allow` the features of the Baseline data, and both move with the release.
 * `@fudic/config` writes it — it reads every key of the file — taken from the language server, which
 * declares it: this package does not, and pnpm exposes no phantom dependencies. Its `exports` has
 * only an `import` condition and no `./package.json`, so it is found in the server's `node_modules`
 * and its entry read off its manifest.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = join(root, '..', 'language-server', 'node_modules', '@fudic', 'config');
const entry = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).exports['.'].import;
const config = await import(pathToFileURL(join(pkg, entry)).href);

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'fudic.schema.json'), `${JSON.stringify(config.projectConfigSchema(), null, 2)}\n`);
console.log('fudic-schema: dist/fudic.schema.json');
