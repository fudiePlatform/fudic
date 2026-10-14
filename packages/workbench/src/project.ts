/**
 * What every workbench of a project stands on, in the order that makes it work: the server
 * (Vite's HMR needs it), the folder with the bare page of each component it starts with, Vite,
 * and the browser. The workbench opened from the editor and `fudic-workbench run` start it the
 * same way, so a criterion cannot pass in one and fail in the other because of the way there.
 *
 * Closing undoes all of it: a browser that outlives the editor is the worst defect this feature
 * can have.
 */

import type { ViteDevServer } from 'vite';
import { emptyBenchDir, removeBenchDir, sweepBenchDirs, writePlanFiles } from './bench-dir.js';
import { startBenchServer, type BenchServer } from './bench-server.js';
import { launchBrowser, type BrowserLike } from './browser.js';
import { benchDir, benchRoutesDir, mountFiles } from './pages.js';
import type { BenchMessage } from './protocol.js';
import type { BenchTarget } from './target.js';
import { isFailure, type WorkbenchFailure, type WorkbenchOptions } from './types.js';
import { startVite } from './vite.js';

export interface Project {
  readonly root: string;
  readonly server: BenchServer;
  readonly vite: ViteDevServer;
  readonly browser: BrowserLike;
  /** The process's workbench folder. */
  readonly dir: string;
  /** To the shells and to `options.onMessage`. */
  publish(message: BenchMessage): void;
  /** Browser, Vite, server, and the folder unless `keep`. */
  close(): Promise<void>;
}

export interface ProjectInput {
  readonly root: string;
  /** Components whose bare page is written before Vite starts. */
  readonly targets: readonly BenchTarget[];
  readonly options: WorkbenchOptions;
  /** A file Vite has finished processing after a change; absent when nothing reruns on save. */
  readonly onProcessed?: (file: string) => void;
}

export async function startProject(input: ProjectInput): Promise<Project | WorkbenchFailure> {
  const { root, options } = input;
  const server = await startBenchServer({ port: options.port ?? 0 });
  const publish = (message: BenchMessage) => {
    server.publish(message);
    options.onMessage?.(message);
  };
  const dir = benchDir(root);
  sweepBenchDirs(dir);
  emptyBenchDir(dir);
  // Before Vite starts: the plugin looks for components once, at start, in the pages it finds.
  for (const target of input.targets) writePlanFiles(dir, target.tag, mountFiles(target));
  const vite = await startVite({
    root,
    routesDir: benchRoutesDir(),
    http: server.http,
    ...(input.onProcessed !== undefined ? { onProcessed: input.onProcessed } : {}),
  });
  server.mount(vite.middlewares);

  const browser = await launchBrowser(options.browser);
  const shutdown = async (opened?: BrowserLike) => {
    await opened?.close();
    await vite.close();
    await server.close();
    if (options.keep !== true) removeBenchDir(dir);
  };
  if (isFailure(browser)) {
    await shutdown();
    return browser;
  }
  return { root, server, vite, browser, dir, publish, close: () => shutdown(browser) };
}
