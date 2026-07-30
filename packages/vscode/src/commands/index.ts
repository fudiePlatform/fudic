/**
 * The four commands of §3.1, and their registration (SDD-25 §4.3).
 *
 * The ids are the contract with `package.json`: a command contributed but not registered
 * shows in the palette and fails when picked, and one registered but not contributed can
 * never be picked at all. The manifest test asserts the same four strings from the other
 * side, so the two halves cannot drift apart in silence.
 */

import { formatDocument } from './format.js';
import { restartServer } from './restart.js';
import { showRegistry } from './registry.js';
import { showVirtualFiles } from './virtual-files.js';
import type { CommandDeps } from './deps.js';
import type { CommandsPort } from '../ports.js';

export const COMMAND_IDS = {
  restartServer: 'fudic.restartServer',
  showVirtualFiles: 'fudic.showVirtualFiles',
  showRegistry: 'fudic.showRegistry',
  formatDocument: 'fudic.formatDocument',
} as const;

/** Every command as a handler, so a test drives them without a command registry. */
export const createHandlers = (
  deps: CommandDeps,
): Readonly<Record<string, () => Promise<void>>> => ({
  [COMMAND_IDS.restartServer]: () => restartServer(deps),
  [COMMAND_IDS.showVirtualFiles]: () => showVirtualFiles(deps),
  [COMMAND_IDS.showRegistry]: () => showRegistry(deps),
  [COMMAND_IDS.formatDocument]: () => formatDocument(deps),
});

export const registerCommands = (commands: CommandsPort, deps: CommandDeps): void => {
  for (const [id, handler] of Object.entries(createHandlers(deps))) commands.register(id, handler);
};

export { formatDocument, restartServer, showRegistry, showVirtualFiles };
export type { CommandDeps };
