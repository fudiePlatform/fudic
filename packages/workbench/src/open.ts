/**
 * Opening a workbench, in the order that makes it work: the target, the server (Vite's HMR needs
 * it), Vite, the browser, the session, and then the first run. Closing undoes all of it, and is
 * idempotent: a Chrome that outlives the editor is the worst defect this feature can have.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { emptyBenchDir, removeBenchDir, sweepBenchDirs, writePlanFiles } from './bench-dir.js';
import { SHELL_PATH, startBenchServer } from './bench-server.js';
import { firstLine, launchBrowser, type BrowserLike } from './browser.js';
import { runCriterion } from './engine.js';
import { benchDir, benchRoutesDir, mountFiles } from './pages.js';
import { classify, Rerunner } from './rerun.js';
import { loadSession, readText, type LoadedSession } from './session.js';
import { resolveTarget, type BenchTarget } from './target.js';
import { isFailure, type WorkbenchFailure, type WorkbenchOptions, type WorkbenchSession } from './types.js';
import { startVite } from './vite.js';

/** The disk, as `resolveTarget` reads it. */
const nodeTargetFs = { readFile: readText, exists: existsSync };

export async function openWorkbench(
  file: string,
  options: WorkbenchOptions = {},
): Promise<WorkbenchSession | WorkbenchFailure> {
  const resolved = resolveTarget(resolve(file), nodeTargetFs);
  if (isFailure(resolved)) return resolved;
  let target: BenchTarget = resolved;

  const server = await startBenchServer({ port: options.port ?? 0 });
  const dir = benchDir(target.projectRoot);
  sweepBenchDirs(dir);
  emptyBenchDir(dir);
  // Before Vite starts: the plugin looks for components once, at start, in the pages it finds.
  writePlanFiles(dir, mountFiles(target));
  // Bound once the rerunner exists; a change Vite processes before that has nothing to rerun.
  let onProcessed = (_file: string): void => undefined;
  const vite = await startVite({
    root: target.projectRoot,
    routesDir: benchRoutesDir(),
    http: server.http,
    onProcessed: (file) => onProcessed(file),
  });
  server.mount(vite.middlewares);

  const browser = await launchBrowser();
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

  let session: LoadedSession = await load();
  async function load(): Promise<LoadedSession> {
    // A `.fudspec` written after the workbench opened is picked up here.
    const again = resolveTarget(target.component, nodeTargetFs);
    if (!isFailure(again)) target = again;
    const loaded = await loadSession({ target, vite, dir });
    server.publish(loaded.message);
    return loaded;
  }

  async function runAll(): Promise<void> {
    const { criteria, loadTerm } = session;
    server.publish({ v: 1, type: 'running', ids: criteria.map((c) => c.id) });
    try {
      for (const criterion of criteria) {
        const result = await runCriterion(browser as BrowserLike, server.origin, criterion, loadTerm);
        server.publish({ v: 1, type: 'result', ...result });
      }
    } catch (error) {
      // The browser went away under the run: the workbench is closing, or Chrome died.
      server.publish({ v: 1, type: 'problem', message: firstLine(error) });
    }
  }

  const rerunner = new Rerunner({
    async reload() {
      try {
        session = await load();
      } catch (error) {
        server.publish({ v: 1, type: 'problem', message: firstLine(error) });
      }
    },
    run: runAll,
  });
  onProcessed = (file) => rerunner.changed(classify(file, target));
  rerunner.request(false);

  let closing: Promise<void> | undefined;
  return {
    url: server.origin + SHELL_PATH,
    tag: target.tag,
    component: target.component,
    criteria: session.criteria.length,
    close() {
      closing ??= (async () => {
        rerunner.stop();
        await shutdown(browser);
      })();
      return closing;
    },
  };
}
