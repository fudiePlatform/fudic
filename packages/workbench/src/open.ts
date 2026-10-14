/**
 * Opening a workbench, in the order that makes it work: the target, the server (Vite's HMR needs
 * it), the folder with the component's bare page, Vite, the browser, and then the first
 * component. A workbench is one project: other components of it open into the same server, Vite
 * and browser. Closing undoes all of it, and is idempotent: a browser that outlives the editor is
 * the worst defect this feature can have.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FUD0977 } from '@fudic/diagnostics';
import { openBench, type Bench } from './bench.js';
import { emptyBenchDir, removeBenchDir, removeTagFiles, sweepBenchDirs, writePlanFiles } from './bench-dir.js';
import { shellPath, startBenchServer } from './bench-server.js';
import { launchBrowser, type BrowserLike } from './browser.js';
import { benchDir, benchRoutesDir, mountFiles } from './pages.js';
import type { BenchMessage } from './protocol.js';
import { readText } from './session.js';
import { resolveTarget, type BenchTarget } from './target.js';
import {
  isFailure,
  type OpenedComponent,
  type WorkbenchFailure,
  type WorkbenchOptions,
  type WorkbenchSession,
} from './types.js';
import { startVite } from './vite.js';

/** The disk, as `resolveTarget` reads it. */
const nodeTargetFs = { readFile: readText, exists: existsSync };

export async function openWorkbench(
  file: string,
  options: WorkbenchOptions = {},
): Promise<WorkbenchSession | WorkbenchFailure> {
  const first = resolveTarget(resolve(file), nodeTargetFs);
  if (isFailure(first)) return first;
  const root = first.projectRoot;

  const server = await startBenchServer({ port: options.port ?? 0 });
  const publish = (message: BenchMessage) => {
    server.publish(message);
    options.onMessage?.(message);
  };
  const dir = benchDir(root);
  sweepBenchDirs(dir);
  emptyBenchDir(dir);
  // Before Vite starts: the plugin looks for components once, at start, in the pages it finds.
  writePlanFiles(dir, first.tag, mountFiles(first));
  const benches = new Map<string, Bench>();
  const vite = await startVite({
    root,
    routesDir: benchRoutesDir(),
    http: server.http,
    onProcessed: (changed) => {
      for (const bench of benches.values()) bench.changed(changed);
    },
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

  const opened = (bench: Bench): OpenedComponent => ({
    url: server.origin + shellPath(bench.target.tag),
    tag: bench.target.tag,
    component: bench.target.component,
    criteria: bench.criteria,
  });

  async function add(target: BenchTarget): Promise<OpenedComponent> {
    // Its bare page first: a component opened late is new to the plugin's next look too.
    writePlanFiles(dir, target.tag, mountFiles(target));
    const bench = await openBench({ target, vite, dir, browser: browser as BrowserLike, origin: server.origin, fs: nodeTargetFs, publish });
    benches.set(target.tag, bench);
    return opened(bench);
  }

  const firstOpened = await add(first);
  let closing: Promise<void> | undefined;
  return {
    ...firstOpened,
    browser: browser.name,
    async open(another) {
      const target = resolveTarget(resolve(another), nodeTargetFs);
      if (isFailure(target)) return target;
      if (target.projectRoot !== root) return { diagnostic: FUD0977({ file: target.component, project: root }) };
      const known = benches.get(target.tag);
      return known === undefined ? add(target) : opened(known);
    },
    closeComponent(tag) {
      const bench = benches.get(tag);
      if (bench === undefined) return;
      bench.stop();
      benches.delete(tag);
      server.forget(tag);
      removeTagFiles(dir, tag);
    },
    close() {
      closing ??= (async () => {
        for (const bench of benches.values()) bench.stop();
        await shutdown(browser);
      })();
      return closing;
    },
  };
}
