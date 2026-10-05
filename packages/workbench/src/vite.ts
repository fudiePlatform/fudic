/**
 * Vite inside the workbench: the project's Vite and the project's fudic plugin, as middleware of
 * the workbench's own server, with its HMR on that same server. Vite already compiles, resolves
 * `@fudic/core` for the browser, hydrates and recompiles on save; the workbench compiles nothing.
 *
 * The user's `vite.config` is not loaded: the workbench's `fudic()` points `routesDir` at the
 * generated pages, and merging would mean replacing the user's own `fudic()` in their list.
 */

import type { Server } from 'node:http';
import { fudic } from '@fudic/vite';
import { createServer, type ViteDevServer } from 'vite';
import { BENCH_FOLDER } from './pages.js';
import type { BenchTarget } from './target.js';

export function startVite(target: BenchTarget, http: Server): Promise<ViteDevServer> {
  // Relative to the root, as the plugin reads it: the same folder as `benchDir`.
  const routesDir = `${BENCH_FOLDER}/${target.tag}/routes`;
  return createServer({
    root: target.projectRoot,
    configFile: false,
    appType: 'custom',
    logLevel: 'warn',
    plugins: [fudic({ routesDir })],
    // The overlay painted one criterion's error over another's page and swallowed its clicks.
    server: { middlewareMode: true, hmr: { server: http, overlay: false } },
  });
}

/**
 * Forgets a file in every module graph. The generated pages live under `node_modules`, out of
 * Vite's watcher, so a page rewritten on disk would otherwise be served from the old transform.
 */
export function invalidateFile(vite: ViteDevServer, file: string): void {
  for (const environment of Object.values(vite.environments)) {
    const graph = environment.moduleGraph;
    for (const module of graph.getModulesByFile(file) ?? []) graph.invalidateModule(module);
  }
}
