/**
 * `fudic.openWorkbench` (SDD-32 §4.10): Ctrl+K V on a `.fud` or its `.fudspec`.
 */

import { NO_ACTIVE_FUD } from './messages.js';
import type { CommandDeps } from './deps.js';

export const openWorkbench = async (deps: CommandDeps): Promise<void> => {
  const file = deps.editor.activeWorkbenchFile();
  if (file === undefined) {
    deps.notifications.warn(NO_ACTIVE_FUD);
    return;
  }
  await deps.workbenches.open(file);
};
