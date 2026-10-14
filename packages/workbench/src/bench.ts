/**
 * One open component of a workbench: its session, loaded again when a file it reads changes, and
 * its runs. A process holds one per component; they share the server, Vite and the browser.
 */

import type { ViteDevServer } from 'vite';
import { firstLine, type BrowserLike } from './browser.js';
import { runCriterion } from './engine.js';
import type { BenchMessage } from './protocol.js';
import { classify, Rerunner } from './rerun.js';
import { loadSession, type LoadedSession } from './session.js';
import { resolveTarget, type BenchTarget, type TargetFs } from './target.js';
import { isFailure } from './types.js';

export interface BenchInput {
  readonly target: BenchTarget;
  readonly vite: ViteDevServer;
  /** The process's workbench folder. */
  readonly dir: string;
  readonly browser: BrowserLike;
  /** The server's origin: the pages the browser measures. */
  readonly origin: string;
  readonly fs: TargetFs;
  publish(message: BenchMessage): void;
}

export interface Bench {
  readonly target: BenchTarget;
  /** Criteria of the session loaded last. */
  readonly criteria: number;
  /** A file Vite has processed: reruns when this component reads it. */
  changed(file: string): void;
  /** Stops running: the component is being closed. */
  stop(): void;
}

/** Loads the session, publishes it, and starts the first run. */
export async function openBench(input: BenchInput): Promise<Bench> {
  let target = input.target;
  let session: LoadedSession = await load();

  async function load(): Promise<LoadedSession> {
    // A `.fudspec` written after the workbench opened is picked up here.
    const again = resolveTarget(target.component, input.fs);
    if (!isFailure(again)) target = again;
    const loaded = await loadSession({ target, vite: input.vite, dir: input.dir });
    input.publish(loaded.message);
    return loaded;
  }

  async function runAll(trigger: string | null): Promise<void> {
    const { criteria, loadTerm } = session;
    const tag = target.tag;
    input.publish({ v: 2, type: 'running', tag, ids: criteria.map((c) => c.id), trigger: { file: trigger, at: Date.now() } });
    try {
      for (const criterion of criteria) {
        const result = await runCriterion(input.browser, input.origin, criterion, loadTerm);
        input.publish({ v: 2, type: 'result', tag, ...result });
      }
    } catch (error) {
      // The browser went away under the run: the workbench is closing, or the browser died.
      input.publish({ v: 2, type: 'problem', message: firstLine(error) });
    }
  }

  const rerunner = new Rerunner({
    async reload() {
      try {
        session = await load();
      } catch (error) {
        input.publish({ v: 2, type: 'problem', message: firstLine(error) });
      }
    },
    run: runAll,
  });
  rerunner.request(false);

  return {
    get target() {
      return target;
    },
    get criteria() {
      return session.criteria.length;
    },
    changed(file) {
      rerunner.changed(classify(file, target, session.reads), file);
    },
    stop() {
      rerunner.stop();
    },
  };
}
