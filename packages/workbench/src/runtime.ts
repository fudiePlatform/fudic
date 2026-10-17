/**
 * Where a project's terms run on: `@fudic/terms` as the project resolves it — its stock terms and
 * its stock extension — and the project's own `fudic/bench.js`. The workbench never imports the
 * package: it is the project's, in the version the project installed.
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ViteDevServer } from 'vite';
import { firstLine } from './browser.js';
import type { BenchExtension, LoadedExtension } from './extension.js';
import { slashes } from './target.js';
import { invalidateFile } from './vite.js';

export const TERMS_PACKAGE = '@fudic/terms';

/** The project's extension, relative to its root. */
export const BENCH_FILE = 'fudic/bench.js';

/** The stock runtime a project installed. */
export interface TermsRuntime {
  /** Its `terms/` folder: the framework layer of terms. */
  readonly termsDir: string;
  readonly stock: LoadedExtension;
}

interface TermsModule {
  readonly stock: BenchExtension;
  termsDir(): string;
}

/**
 * The package's manifest in the `node_modules` of the project or of a folder above it, following
 * pnpm's link. Not Node's resolution: it also looks in `NODE_PATH`, which pnpm points at the
 * repository's hidden hoist — where a sibling project's install would answer for this one.
 */
function installedManifest(projectRoot: string): string | null {
  for (let dir = resolve(projectRoot); ; dir = dirname(dir)) {
    const manifest = join(dir, 'node_modules', TERMS_PACKAGE, 'package.json');
    if (existsSync(manifest)) return realpathSync(manifest);
    if (dirname(dir) === dir) return null;
  }
}

/** `@fudic/terms` as the project installed it; null when it is not installed there. */
export async function resolveRuntime(projectRoot: string): Promise<TermsRuntime | null> {
  const manifest = installedManifest(projectRoot);
  if (manifest === null) return null;
  const main = (JSON.parse(readFileSync(manifest, 'utf8')) as { main: string }).main;
  const entry = join(dirname(manifest), main);
  const module = (await import(pathToFileURL(entry).href)) as TermsModule;
  return { termsDir: slashes(module.termsDir()), stock: { file: slashes(entry), extension: module.stock } };
}

/**
 * Where the stock extension goes when the package is missing: every term that touches `ctx`
 * fails saying so, instead of on a method that is not there.
 */
export function missingRuntime(projectRoot: string): LoadedExtension {
  const message = `${TERMS_PACKAGE} is not installed in ${projectRoot}: pnpm add -D ${TERMS_PACKAGE}`;
  const ctx = new Proxy(
    {},
    {
      get() {
        throw new Error(message);
      },
    },
  );
  return { file: TERMS_PACKAGE, extension: { context: () => ctx } };
}

/** The project's `fudic/bench.js`, run by Vite: none, the extension, or why it could not load. */
export async function loadProjectExtension(
  projectRoot: string,
  vite: ViteDevServer,
): Promise<LoadedExtension | { readonly error: string } | null> {
  const file = `${projectRoot}/${BENCH_FILE}`;
  if (!existsSync(file)) return null;
  invalidateFile(vite, file);
  try {
    const module = await vite.ssrLoadModule(file);
    return { file, extension: (module['default'] ?? {}) as BenchExtension };
  } catch (error) {
    return { error: `${file}: ${firstLine(error)}` };
  }
}
