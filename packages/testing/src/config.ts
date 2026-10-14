import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fudic, type FudicOptions } from '@fudic/vite';
import type { Plugin } from 'vite';
import type {} from 'vitest/config';

/** Where a page of the test lives unless it says otherwise. */
export const BASE_URL = 'http://localhost/';

/**
 * The `fudic` environment, by path: vitest loads a custom environment from a file. Its
 * extension is this module's own, so the path holds both from `dist` and from source.
 */
export const ENVIRONMENT = fileURLToPath(
  new URL(`./environment${extname(fileURLToPath(import.meta.url))}`, import.meta.url),
);

/**
 * The plugins a project's `vitest.config.ts` needs: its `fudic()` — which reads `fudic.json`
 * and `src/http.ts` as `vite dev` does — and the one that puts vitest in the `fudic`
 * environment at `http://localhost/`.
 */
export function fudicTest(options: FudicOptions = {}): Plugin[] {
  return [
    fudic(options),
    {
      name: 'fudic:test',
      config: () => ({
        test: {
          environment: ENVIRONMENT,
          environmentOptions: { happyDOM: { url: BASE_URL } },
        },
      }),
    },
  ];
}
