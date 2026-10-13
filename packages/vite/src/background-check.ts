/**
 * The typecheck of a build, run on a worker thread WHILE the build bundles.
 *
 * The check is TypeScript's: building the program and checking it takes one to two seconds
 * on a small app, and it used to block `buildStart` for all of it — nothing was compiled until
 * the verdict was in. Nothing the bundle does depends on that verdict except whether the build
 * is allowed to finish, so the check runs beside it and is waited for before anything can fail
 * (`src/plugin.ts`, `settleCheck`).
 *
 * A thread and not a promise: the check is synchronous CPU work, and on the main thread it
 * would still run before the bundle, only later.
 */

import { Worker } from 'node:worker_threads';
import type { CheckReport } from '@fudic/typecheck/problems';

/** The worker script: `worker/check.mjs`, one directory above both `src/` and `dist/`. */
export const CHECK_SCRIPT = new URL('../worker/check.mjs', import.meta.url);

/** A check in flight. */
export interface BackgroundCheck {
  /** The report, once the thread has it. Rejects if the thread itself fails. */
  readonly report: Promise<CheckReport>;
  /** Stop the thread: the build failed for another reason and nobody will read the verdict. */
  cancel(): Promise<void>;
}

/** Start the check of the project at `root`. */
export function startBackgroundCheck(root: string, script: URL = CHECK_SCRIPT): BackgroundCheck {
  const worker = new Worker(script, { workerData: { root } });
  const report = new Promise<CheckReport>((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
  });
  // Handled here so a failure that arrives before anyone awaits it is not an unhandled
  // rejection that kills the process; whoever awaits `report` still gets the error.
  report.catch(() => undefined);
  return {
    report,
    cancel: async () => {
      await worker.terminate();
    },
  };
}
