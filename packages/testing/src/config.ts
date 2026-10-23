import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fudic, type FudicOptions } from '@fudic/vite';
import { API_SCHEME } from '@fudic/vite/harness';
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

/** What a generated module `fudic:<id>` imports in place of `@fudic/http/contract` (SDD-60 §4.4). */
export const CONTRACT = sibling('contract');

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
 * and the `.fudapi` of the app as `vite dev` does — and the one that puts vitest in the `fudic`
 * environment at `http://localhost/`, and the one that hands a `.fudapi` its contract (SDD-60 §4.4).
 */
export function fudicTest(options: FudicOptions = {}): Plugin[] {
  return [
    // No live type check: nobody watches an overlay in a test run (decision 8.1.13).
    fudic({ liveCheck: false, ...options }),
    {
      name: 'fudic:test',
      config: (user) => ({
        test: {
          // One process per worker that runs many files, not one per file (BUG-51): loading the
          // compiler, Oxc's addon and the plugin is most of what a test file cost, ~1 s each.
          // The setup drops the app's modules between files, so no state crosses from one to
          // the next. Processes and not threads: Oxc's native addon on a `worker_thread` is what
          // crashed Node with an access violation. A project that chose its own keeps it.
          pool: user.test?.pool ?? 'forks',
          isolate: user.test?.isolate ?? false,
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
    {
      // A function of a `.fudapi` is the page's call and the server's contract in one graph.
      name: 'fudic:test-contract',
      enforce: 'pre',
      resolveId: (id, importer) => (id === '@fudic/http/contract' && importer?.startsWith(API_SCHEME) === true ? CONTRACT : null),
    },
  ];
}
