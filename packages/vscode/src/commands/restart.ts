/**
 * `fudic.restartServer` (SDD-25 §4.3).
 *
 * The escape valve against stale state no watcher saw: dependencies installed, a branch
 * changed, a different `tsdk`. It costs twenty lines and cannot be left out — pretending
 * invalidation is perfect is what leaves extensions wedged with no way out.
 *
 * It has to work *with the server already dead*, which is the state it exists for.
 */

import { RESTART_FAILED } from './messages.js';
import type { CommandDeps } from './deps.js';

export const restartServer = async (deps: CommandDeps): Promise<void> => {
  deps.logger.info('restarting the language server');
  const running = await deps.session.restart();
  if (!running) deps.notifications.warn(RESTART_FAILED);
};
