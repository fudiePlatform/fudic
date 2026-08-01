/**
 * Starting the server, and giving up on it (SDD-25 §4.4).
 *
 * Three attempts with exponential backoff, then the manual restart. **Not a loop**: a
 * client that retries forever burns a core and hides the reason, and the reason is always
 * external — a missing dependency, a broken build, a `tsdk` that moved. After three tries
 * the honest answer is to stop and say so.
 *
 * The clock is injected. A test that actually waits seven seconds is a test nobody runs.
 */

import type { ServerState } from './status.js';

/** Total attempts, including the first. */
export const ATTEMPTS = 3;

/** The waits *between* attempts — two of them for three tries. */
export const BACKOFF_MS: readonly number[] = [1000, 2000];

export interface SupervisorDeps {
  start(): Promise<void>;
  onState(state: ServerState): void;
  /** Injected clock. */
  delay(ms: number): Promise<void>;
  log(message: string): void;
  /** Called once, after the last attempt fails. */
  offerRestart(): void;
}

/** Starts the server, retrying. Resolves to whether it came up. */
export const superviseStart = async (deps: SupervisorDeps): Promise<boolean> => {
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    deps.onState('starting');
    try {
      await deps.start();
      return true;
    } catch (error) {
      deps.log(`attempt ${String(attempt + 1)} of ${String(ATTEMPTS)} failed: ${String(error)}`);
      const wait = BACKOFF_MS[attempt];
      if (wait !== undefined) await deps.delay(wait);
    }
  }

  deps.onState('stopped');
  deps.offerRestart();
  return false;
};

/** What the user is told when the retries are spent — the escape valve of §4.3. */
export const RESTART_HINT =
  'Fudic: the language server did not start after three attempts. Run "Fudic: Restart Language Server" once the cause is fixed.';
