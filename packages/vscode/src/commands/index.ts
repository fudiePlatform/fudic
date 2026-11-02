/**
 * The commands of §3.1, and their registration (SDD-25 §4.3).
 *
 * The ids are the contract with `package.json`: a command contributed but not registered
 * shows in the palette and fails when picked, and one registered but not contributed can
 * never be picked at all. The manifest test asserts the same four strings from the other
 * side, so the two halves cannot drift apart in silence.
 */

import { API_COMMAND_IDS, ApiCommands } from './api.js';
import { toggleCommentCommand } from './comment.js';
import { formatDocument } from './format.js';
import { restartServer } from './restart.js';
import { showRegistry } from './registry.js';
import { showVirtualFiles } from './virtual-files.js';
import { openWorkbench } from './workbench.js';
import type { CommandDeps } from './deps.js';
import type { CommandsPort } from '../ports.js';

export const COMMAND_IDS = {
  restartServer: 'fudic.restartServer',
  showVirtualFiles: 'fudic.showVirtualFiles',
  showRegistry: 'fudic.showRegistry',
  formatDocument: 'fudic.formatDocument',
  toggleComment: 'fudic.toggleComment',
  openWorkbench: 'fudic.openWorkbench',
  ...API_COMMAND_IDS,
} as const;

/**
 * Every command as a handler, so a test drives them without a command registry; the `.fudapi`
 * ones from `api`, which keeps the module views open.
 */
export const createHandlers = (
  deps: CommandDeps,
  api: ApiCommands = new ApiCommands(deps),
): Readonly<Record<string, (...args: readonly unknown[]) => Promise<void>>> => ({
  [COMMAND_IDS.restartServer]: () => restartServer(deps),
  [COMMAND_IDS.showVirtualFiles]: () => showVirtualFiles(deps),
  [COMMAND_IDS.showRegistry]: () => showRegistry(deps),
  [COMMAND_IDS.formatDocument]: () => formatDocument(deps),
  [COMMAND_IDS.toggleComment]: () => toggleCommentCommand(deps),
  [COMMAND_IDS.openWorkbench]: () => openWorkbench(deps),
  ...api.handlers(),
});

/** Registers every command; answers the `.fudapi` ones, whose views follow a save. */
export const registerCommands = (commands: CommandsPort, deps: CommandDeps): ApiCommands => {
  const api = new ApiCommands(deps);
  for (const [id, handler] of Object.entries(createHandlers(deps, api))) commands.register(id, handler);
  return api;
};

export { ApiCommands, formatDocument, openWorkbench, restartServer, showRegistry, showVirtualFiles, toggleCommentCommand };
export type { CommandDeps };
