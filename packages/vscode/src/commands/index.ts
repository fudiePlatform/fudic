/**
 * The four commands of §3.1, and their registration (SDD-25 §4.3).
 *
 * The ids are the contract with `package.json`: a command contributed but not registered
 * shows in the palette and fails when picked, and one registered but not contributed can
 * never be picked at all. The manifest test asserts the same four strings from the other
 * side, so the two halves cannot drift apart in silence.
 */

import { toggleCommentCommand } from './comment.js';
import { formatDocument } from './format.js';
import { restartServer } from './restart.js';
import { showRegistry } from './registry.js';
import { showVirtualFiles } from './virtual-files.js';
import { APPLY_SNIPPET_EDIT, applySnippetEdit } from './snippet-edit.js';
import type { CommandDeps } from './deps.js';
import type { CommandsPort, SnippetEditPort } from '../ports.js';

export const COMMAND_IDS = {
  restartServer: 'fudic.restartServer',
  showVirtualFiles: 'fudic.showVirtualFiles',
  showRegistry: 'fudic.showRegistry',
  formatDocument: 'fudic.formatDocument',
  toggleComment: 'fudic.toggleComment',
} as const;

/** Every command as a handler, so a test drives them without a command registry. */
export const createHandlers = (
  deps: CommandDeps,
): Readonly<Record<string, () => Promise<void>>> => ({
  [COMMAND_IDS.restartServer]: () => restartServer(deps),
  [COMMAND_IDS.showVirtualFiles]: () => showVirtualFiles(deps),
  [COMMAND_IDS.showRegistry]: () => showRegistry(deps),
  [COMMAND_IDS.formatDocument]: () => formatDocument(deps),
  [COMMAND_IDS.toggleComment]: () => toggleCommentCommand(deps),
});

export const registerCommands = (commands: CommandsPort, deps: CommandDeps): void => {
  for (const [id, handler] of Object.entries(createHandlers(deps))) commands.register(id, handler);
};

/**
 * The commands the palette must NOT show, registered apart from the five it does.
 *
 * `COMMAND_IDS` is the list `package.json` contributes, and contributing this one would put
 * «apply snippet edit» in the palette — where it takes no arguments and therefore does
 * nothing. A command invoked only by a code action needs registration and no contribution,
 * which is the exact opposite of the rule the five above live by.
 */
export const registerInternalCommands = (
  commands: CommandsPort,
  snippetEdit: SnippetEditPort,
): void => {
  commands.register(APPLY_SNIPPET_EDIT, (...args) => applySnippetEdit(snippetEdit, args));
};

export { formatDocument, restartServer, showRegistry, showVirtualFiles, toggleCommentCommand };
export { APPLY_SNIPPET_EDIT, applySnippetEdit, snippetEditOf } from './snippet-edit.js';
export type { CommandDeps };
