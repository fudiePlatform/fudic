/**
 * Opening a workbench: the target, the project under it (`startProject`), and then the first
 * component. A workbench is one project: other components of it open into the same server, Vite
 * and browser. Closing is idempotent.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FUD0977 } from '@fudic/diagnostics';
import { openBench, type Bench } from './bench.js';
import { removeTagFiles, writePlanFiles } from './bench-dir.js';
import { shellPath } from './bench-server.js';
import { mountFiles } from './pages.js';
import { startProject, type Project } from './project.js';
import type { RunCommand } from './protocol.js';
import { DEFAULT_WORKERS } from './runner.js';
import { readText } from './session.js';
import { resolveTarget, type BenchTarget, type TargetFs } from './target.js';
import {
  isFailure,
  type OpenedComponent,
  type WorkbenchFailure,
  type WorkbenchOptions,
  type WorkbenchSession,
} from './types.js';

/** The disk, as `resolveTarget` reads it. */
export const nodeTargetFs: TargetFs = { readFile: readText, exists: existsSync };

export async function openWorkbench(
  file: string,
  options: WorkbenchOptions = {},
): Promise<WorkbenchSession | WorkbenchFailure> {
  const first = resolveTarget(resolve(file), nodeTargetFs);
  if (isFailure(first)) return first;
  const root = first.projectRoot;

  const benches = new Map<string, Bench>();
  const started = await startProject({
    root,
    targets: [first],
    options,
    onProcessed: (changed) => {
      for (const bench of benches.values()) bench.changed(changed);
    },
  });
  if (isFailure(started)) return started;
  const project: Project = started;

  const opened = (bench: Bench): OpenedComponent => ({
    url: project.server.origin + shellPath(bench.target.tag),
    tag: bench.target.tag,
    component: bench.target.component,
    criteria: bench.criteria,
  });

  async function add(target: BenchTarget): Promise<OpenedComponent> {
    // Its bare page first: a component opened late is new to the plugin's next look too.
    writePlanFiles(project.dir, target.tag, mountFiles(target));
    const bench = await openBench({
      target,
      vite: project.vite,
      dir: project.dir,
      browser: project.browser,
      origin: project.server.origin,
      fs: nodeTargetFs,
      workers: options.workers ?? DEFAULT_WORKERS,
      shots: { put: (tag, id, kind, png) => project.server.putShot(tag, id, kind, png) },
      publish: project.publish,
    });
    benches.set(target.tag, bench);
    return opened(bench);
  }

  const command = (asked: RunCommand) => benches.get(asked.tag)?.command(asked);
  project.server.onCommand(command);

  const firstOpened = await add(first);
  let closing: Promise<void> | undefined;
  return {
    ...firstOpened,
    browser: project.browser.name,
    command,
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
      project.server.forget(tag);
      removeTagFiles(project.dir, tag);
    },
    close() {
      closing ??= (async () => {
        for (const bench of benches.values()) bench.stop();
        await project.close();
      })();
      return closing;
    },
  };
}
