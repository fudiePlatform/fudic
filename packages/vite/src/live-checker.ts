/**
 * The checker of `vite dev`, in a CHILD PROCESS that lives as long as the server (BUG-51).
 *
 * The check is TypeScript's, and the first one builds the whole program: two seconds on a small
 * app. In the server's own process that is two seconds in which nothing else runs — `listen`
 * included, so the dev server was silent and closed for all of it. In a child it runs beside the
 * server, which answers as soon as it is up; a page still waits for the verdict before it is
 * shown, because what the editor marks is what the browser refuses to show (SDD-35 §4.5).
 *
 * A process and not a thread, for the reason `background-check.ts` gives: on a `worker_thread`
 * TypeScript, Volar and Oxc's native addon share the server's process, and Node died with an
 * access violation. A child that dies is a rejected check, and `resilientChecker` answers it
 * with a checker in this process, exactly as the server checked before.
 */

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { CheckReport } from '@fudic/typecheck/problems';

/** The child's script: `worker/live-check.mjs`, one directory above both `src/` and `dist/`. */
export const LIVE_CHECK_SCRIPT = new URL('../worker/live-check.mjs', import.meta.url);

/** A checker the dev server can wait on without blocking. */
export interface LiveChecker {
  check(): Promise<CheckReport>;
  invalidate(path: string): void;
  dispose(): void;
}

/** What a checker in this process gives: `@fudic/typecheck`'s own, which answers at once. */
export interface SyncChecker {
  check(): CheckReport;
  invalidate(path: string): void;
}

/** The checker of the project at `root`, in a child process started from `script`. */
export function startLiveChecker(root: string, script: URL = LIVE_CHECK_SCRIPT): LiveChecker {
  // `execArgv: []`: a plain Node, whatever flags started this one (see `background-check.ts`).
  const child = fork(fileURLToPath(script), [root], { execArgv: [] });
  const pending = new Map<number, { resolve(report: CheckReport): void; reject(error: Error): void }>();
  let next = 0;
  let dead: Error | undefined;

  child.on('message', (message) => {
    const { id, report } = message as { readonly id: number; readonly report: CheckReport };
    pending.get(id)?.resolve(report);
    pending.delete(id);
  });
  const die = (error: Error): void => {
    dead = error;
    for (const one of pending.values()) one.reject(error);
    pending.clear();
  };
  child.on('error', die);
  child.on('close', (code, signal) => {
    die(new Error(`the typecheck process ended (${signal ?? `exit code ${String(code)}`})`));
  });

  return {
    check: () => {
      if (dead !== undefined) return Promise.reject(dead);
      const id = next++;
      return new Promise<CheckReport>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        child.send({ type: 'check', id });
      });
    },
    invalidate: (path) => {
      if (dead === undefined) child.send({ type: 'invalidate', path });
    },
    dispose: () => {
      child.kill();
    },
  };
}

/**
 * `live`, and once it fails, a checker in this process for good: a dead child is no reason to
 * stop checking. `local` is asked for only then, so TypeScript loads here only if it must.
 */
export function resilientChecker(live: LiveChecker, local: () => Promise<SyncChecker>): LiveChecker {
  let fallback: Promise<SyncChecker> | undefined;
  return {
    check: async () => {
      if (fallback === undefined) {
        try {
          return await live.check();
        } catch {
          fallback = local();
        }
      }
      return (await fallback).check();
    },
    invalidate: (path) => {
      if (fallback === undefined) live.invalidate(path);
      else void fallback.then((checker) => checker.invalidate(path));
    },
    dispose: () => {
      live.dispose();
    },
  };
}
