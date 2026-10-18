import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fudic, type FudicOptions } from '@fudic/vite';
import type { Plugin } from 'vite';
import type {} from 'vitest/config';
import { BASE_URL, FILE_EXPORT, OPTIONS_KEY, ROOT_KEY } from './constants.js';

/**
 * A module next to this one, by path: vitest loads a custom environment and a setup file
 * from a file. The extension is this module's own, so the path holds both from `dist` and
 * from source.
 */
function sibling(name: string): string {
  return fileURLToPath(new URL(`./${name}${extname(fileURLToPath(import.meta.url))}`, import.meta.url));
}

/** The `fudic` environment (§4.1). */
export const ENVIRONMENT = sibling('environment');

/** What every test file runs first, inside the environment (§4.4, §4.8). */
export const SETUP = sibling('setup');

/**
 * What vitest would otherwise hand to Node untransformed because it sits under `node_modules`:
 * the generated wrappers — a `.fud` they import means nothing to Node — and this package itself
 * once installed. Its `visit` and `renderLayout` import those wrappers by path, "through vitest's
 * graph"; handed to Node, that import is Node's, which refuses `C:/…` and never compiles a `.fud`
 * (BUG-50: a project installed from a registry failed its first test; the workspace never saw
 * it, because a linked package is not under `node_modules`).
 */
export const INLINE = /node_modules[\\/](?:\.fudic-test|@fudic[\\/]testing)[\\/]/u;

/**
 * What only the harness runs — the plugin and the compiler, which `mount` asks for a graph
 * and a wrapper — goes to Node as it is: loaded once per worker instead of once per test
 * file, and nothing of it has to share an instance with the test's graph. Installed, they
 * live under `node_modules` and Node gets them anyway; this covers a workspace too.
 */
export const EXTERNAL = /[\\/](?:@fudic|packages)[\\/](?:vite|compiler)[\\/]dist[\\/]/u;

/** A `.fud` imported plain: no query, so its compiled module is the one with `render`. */
function isPlainFud(id: string): boolean {
  return id.endsWith('.fud') && !id.startsWith('\0');
}

/**
 * The plugins a project's `vitest.config.ts` needs: its `fudic()` — which reads `fudic.json`
 * and `src/http.ts` as `vite dev` does — and the one that puts vitest in the `fudic`
 * environment at `http://localhost/`.
 */
export function fudicTest(options: FudicOptions = {}): Plugin[] {
  return [
    // No live type check: nobody watches an overlay in a test run (decision 8.1.13).
    fudic({ liveCheck: false, ...options }),
    {
      name: 'fudic:test',
      config: (user) => ({
        test: {
          environment: ENVIRONMENT,
          environmentOptions: {
            happyDOM: {
              url: BASE_URL,
              // happy-dom would fetch a page's `<link>` and `<script src>` from the real network,
              // where nothing listens: the harness imports every module itself, and a sheet is
              // the browser's to load (§1.1). Disabled, and taken as loaded.
              settings: {
                disableCSSFileLoading: true,
                disableJavaScriptFileLoading: true,
                handleDisabledFileLoadingAsSuccess: true,
              },
            },
          },
          setupFiles: [SETUP],
          provide: {
            [ROOT_KEY]: resolve(user.root ?? process.cwd()),
            [OPTIONS_KEY]: { ...options, base: user.base ?? '/' },
          },
          server: { deps: { inline: [INLINE], external: [EXTERNAL] } },
        },
      }),
      transform(code, id) {
        if (!isPlainFud(id)) return null;
        return { code: `${code}\nexport const ${FILE_EXPORT} = ${JSON.stringify(id)};\n`, map: null };
      },
    },
  ];
}
