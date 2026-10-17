/**
 * One open component of a workbench: its session, loaded again when a file it reads changes, and
 * its runs — in parallel, the failing ones first, photographed, and steered by the shell: run
 * these, run the failing, pin one, pause, cancel. A process holds one per component; they share
 * the server, Vite and the browser.
 */

import type { ViteDevServer } from 'vite';
import { firstLine, type BrowserLike } from './browser.js';
import { runCriterion, type CriterionResult } from './engine.js';
import type { BenchMessage, RunCommand, ShotRef, Verdict } from './protocol.js';
import { classify, Rerunner } from './rerun.js';
import { runOrder, runPool } from './runner.js';
import { loadSession, type LoadedSession } from './session.js';
import { resolveTarget, type BenchTarget, type TargetFs } from './target.js';
import { isFailure } from './types.js';

/** Where the shots of a run are kept and served from. */
export interface ShotStore {
  /** Keeps the PNG and answers its URL; the previous shot of that criterion and kind goes. */
  put(tag: string, id: string, kind: 'before' | 'after', png: Buffer): string;
}

export interface BenchInput {
  readonly target: BenchTarget;
  readonly vite: ViteDevServer;
  /** The process's workbench folder. */
  readonly dir: string;
  readonly browser: BrowserLike;
  /** The server's origin: the pages the browser measures. */
  readonly origin: string;
  readonly fs: TargetFs;
  /** Criteria that run at once. */
  readonly workers: number;
  readonly shots: ShotStore;
  publish(message: BenchMessage): void;
}

export interface Bench {
  readonly target: BenchTarget;
  /** Criteria of the session loaded last. */
  readonly criteria: number;
  /** A file Vite has processed: reruns when this component reads it. */
  changed(file: string): void;
  /** What a shell asked for. */
  command(command: RunCommand): void;
  /** Stops running: the component is being closed. */
  stop(): void;
}

/** Saves that arrived while paused: one run when it resumes. */
interface Pending {
  count: number;
  reload: boolean;
  trigger: string | null;
}

/** Loads the session, publishes it, and starts the first run. */
export async function openBench(input: BenchInput): Promise<Bench> {
  let target = input.target;
  const verdicts = new Map<string, Verdict>();
  let pinned: string | null = null;
  let paused = false;
  let pending: Pending = { count: 0, reload: false, trigger: null };
  let running: AbortController | undefined;
  let session: LoadedSession = await load();

  async function load(): Promise<LoadedSession> {
    // A `.fudspec` written after the workbench opened is picked up here.
    const again = resolveTarget(target.component, input.fs);
    if (!isFailure(again)) target = again;
    const loaded = await loadSession({ target, vite: input.vite, dir: input.dir });
    input.publish({ ...loaded.message, browser: input.browser.name, viewport: input.browser.viewport });
    return loaded;
  }

  function publishState(): void {
    input.publish({ v: 2, type: 'state', tag: target.tag, paused, pinned, pending: pending.count });
  }

  function publishResult(result: CriterionResult): void {
    const { id, shots, ...rest } = result;
    const was = verdicts.get(id);
    verdicts.set(id, result.verdict);
    const refs: { before?: ShotRef; after?: ShotRef } = {};
    for (const kind of ['before', 'after'] as const) {
      const shot = shots[kind];
      if (shot === undefined) continue;
      refs[kind] = { url: input.shots.put(target.tag, id, kind, shot.png), width: shot.box.width, height: shot.box.height };
    }
    input.publish({ v: 2, type: 'result', tag: target.tag, id, ...rest, ...(was !== undefined ? { was } : {}), shots: refs });
  }

  async function run(trigger: string | null, ids: readonly string[] | undefined): Promise<void> {
    const { loadTerm, extensions } = session;
    const tag = target.tag;
    const chosen = ids === undefined ? session.criteria : session.criteria.filter((c) => ids.includes(c.id));
    const criteria = runOrder(chosen, verdicts);
    if (criteria.length === 0) return;
    input.publish({ v: 2, type: 'running', tag, ids: criteria.map((c) => c.id), trigger: { file: trigger, at: Date.now() } });
    const controller = new AbortController();
    running = controller;
    try {
      const unfinished = await runPool({
        criteria,
        workers: input.workers,
        signal: controller.signal,
        run: (criterion, signal) => runCriterion(input.browser, input.origin, criterion, loadTerm, extensions, signal),
        done: publishResult,
      });
      if (unfinished.length > 0) input.publish({ v: 2, type: 'cancelled', tag, ids: unfinished });
    } catch (error) {
      // The browser went away under the run: the workbench is closing, or the browser died.
      input.publish({ v: 2, type: 'problem', message: firstLine(error) });
    } finally {
      running = undefined;
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
    run,
  });
  rerunner.request(false);

  /** What a save runs: the pinned criterion alone, or every one. */
  const onSave = (): readonly string[] | undefined => (pinned === null ? undefined : [pinned]);

  return {
    get target() {
      return target;
    },
    get criteria() {
      return session.criteria.length;
    },
    changed(file) {
      const change = classify(file, target, session.reads);
      if (change === 'none') return;
      if (paused) {
        pending = { count: pending.count + 1, reload: pending.reload || change === 'session', trigger: file };
        publishState();
        return;
      }
      rerunner.changed(change, file, onSave());
    },
    command(command) {
      switch (command.type) {
        case 'run': {
          let ids = command.failing === true
            ? session.criteria.filter((c) => verdicts.get(c.id) !== 'pass').map((c) => c.id)
            : command.ids;
          // A pinned criterion is the only one Run all and Run failing reach; naming ids still
          // runs those.
          if (command.ids === undefined && pinned !== null) ids = (ids ?? [pinned]).filter((id) => id === pinned);
          if (ids?.length !== 0) rerunner.request(false, null, ids);
          return;
        }
        case 'pin':
          pinned = command.id;
          publishState();
          return;
        case 'pause': {
          paused = command.paused;
          const waiting = pending;
          if (!paused) pending = { count: 0, reload: false, trigger: null };
          publishState();
          if (!paused && waiting.count > 0) rerunner.request(waiting.reload, waiting.trigger, onSave());
          return;
        }
        case 'cancel':
          running?.abort();
          return;
      }
    },
    stop() {
      rerunner.stop();
      running?.abort();
    },
  };
}
