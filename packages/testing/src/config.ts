import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fudic, type FudicOptions } from '@fudic/vite';
import type { Plugin } from 'vite';
import type {} from 'vitest/config';

/** Where a page of the test lives unless it says otherwise. */
export const BASE_URL = 'http://localhost/';

/** The key the project root is provided under, for the worker to find the cache (§4.2). */
export const ROOT_KEY = 'fudicRoot';

/** Where the harness writes the host pages and wrappers it generates, under the root. */
export const CACHE_FOLDER = 'node_modules/.fudic-test';

/**
 * The export through which a `.fud` tells the harness its own file, so a host page can link
 * it (§4.2). Added in the `fudic` environment only: production modules never carry it.
 */
export const FILE_EXPORT = '$file';

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
          environmentOptions: { happyDOM: { url: BASE_URL } },
          setupFiles: [SETUP],
          provide: { [ROOT_KEY]: resolve(user.root ?? process.cwd()) },
          // The generated wrappers live under `node_modules`, which vitest would otherwise
          // hand to Node untransformed — and a `.fud` they import means nothing to Node.
          server: { deps: { inline: [/node_modules[\\/]\.fudic-test[\\/]/u] } },
        },
      }),
      transform(code, id) {
        if (!isPlainFud(id)) return null;
        return { code: `${code}\nexport const ${FILE_EXPORT} = ${JSON.stringify(id)};\n`, map: null };
      },
    },
  ];
}
