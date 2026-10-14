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
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import { slashes } from './target.js';

export interface ViteInput {
  /** The project root. */
  readonly root: string;
  /** Relative to the root, as the plugin reads it. */
  readonly routesDir: string;
  /** The workbench's server: Vite's HMR listens on it. */
  readonly http: Server;
  /**
   * A file Vite has finished processing after a change: see `processedChanges`. Absent when
   * nothing reruns on save (`fudic-workbench run`).
   */
  readonly onProcessed?: (file: string) => void;
}

export function startVite(input: ViteInput): Promise<ViteDevServer> {
  return createServer({
    root: input.root,
    configFile: false,
    appType: 'custom',
    logLevel: 'warn',
    // `liveCheck: false`: the editor and the build already report type errors. Here nobody reads
    // them, and the checker cost most of a second to start and kept checking while Chrome measured.
    plugins: [
      fudic({ routesDir: input.routesDir, liveCheck: false }),
      ...(input.onProcessed !== undefined ? [processedChanges(input.onProcessed)] : []),
    ],
    // The overlay painted one criterion's error over another's page and swallowed its clicks.
    server: { middlewareMode: true, hmr: { server: input.http, overlay: false } },
  });
}

/**
 * Tells when Vite has processed a changed file: once `hotUpdate` ran for it in EVERY
 * environment, whatever Vite decided to send. Waiting for a `full-reload` instead waits forever
 * on a component that ships no client JS — it is in no client graph, and nothing reloads.
 */
export function processedChanges(onProcessed: (file: string) => void): Plugin {
  let environments: readonly string[] = [];
  const seen = new Map<string, Set<string>>();
  return {
    name: 'fudic-workbench:processed',
    configureServer(server) {
      environments = Object.keys(server.environments);
    },
    hotUpdate({ file }) {
      const done = seen.get(file) ?? new Set<string>();
      done.add(this.environment.name);
      if (environments.every((name) => done.has(name))) {
        seen.delete(file);
        onProcessed(slashes(file));
      } else {
        seen.set(file, done);
      }
    },
  };
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
