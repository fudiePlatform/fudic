/**
 * The typecheck of a build, run in a CHILD PROCESS while the build bundles.
 *
 * The check is TypeScript's: building the program and checking it takes one to two seconds
 * on a small app, and it used to block `buildStart` for all of it — nothing was compiled until
 * the verdict was in. Nothing the bundle does depends on that verdict except whether the build
 * is allowed to finish, so the check runs beside it and is waited for before anything can fail
 * (`src/plugin.ts`, `settleCheck`).
 *
 * A process and not a thread, and that is measured, not argued: on a `worker_thread` the check
 * loads TypeScript, Volar and Oxc's native addon into the build's own process, and Node died
 * with an access violation (0xC0000005) often enough to show up in a test suite. A crash in a
 * child is an exit code this module reports; a crash in a thread is the end of `vite build`.
 */

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { CheckReport } from '@fudic/typecheck/problems';

/** The child's script: `worker/check.mjs`, one directory above both `src/` and `dist/`. */
export const CHECK_SCRIPT = new URL('../worker/check.mjs', import.meta.url);

/** A check in flight. */
export interface BackgroundCheck {
  /** The report, once the child has sent it. Rejects if the child ends without sending it. */
  readonly report: Promise<CheckReport>;
  /** Stop the child: the build failed for another reason and nobody will read the verdict. */
  cancel(): Promise<void>;
}

/** Start the check of the project at `root`. */
export function startBackgroundCheck(root: string, script: URL = CHECK_SCRIPT): BackgroundCheck {
  // `execArgv: []`: the child is a plain Node, whatever flags started this one — a host run
  // under `--inspect` must not hand its debugger port to a second process.
  const child = fork(fileURLToPath(script), [root], { execArgv: [] });
  const report = new Promise<CheckReport>((resolve, reject) => {
    child.once('message', (message) => resolve(message as CheckReport));
    child.once('error', reject);
    // `close` and not `exit`: only `close` waits for the IPC channel, so a report sent right
    // before the child ends is always delivered first. After a report this changes nothing:
    // the promise is already settled.
    child.once('close', (code, signal) => {
      reject(new Error(`the typecheck process ended before it reported (${signal ?? `exit code ${String(code)}`})`));
    });
  });
  // Handled here so a failure that arrives before anyone awaits it is not an unhandled
  // rejection that kills the process; whoever awaits `report` still gets the error.
  report.catch(() => undefined);
  return {
    report,
    cancel: async () => {
      child.kill();
    },
  };
}
