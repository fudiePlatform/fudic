/**
 * The commands a workbench obeys, whoever sends them: the parent process on stdin today, the
 * shell's socket too once it can speak. One place decides what each command does.
 */

import type { Command, ErrorMessage, OpenedMessage } from './protocol.js';
import { isFailure, type WorkbenchSession } from './types.js';

/** What a command answers on stdout; nothing for the ones that only act. */
export type Answer = OpenedMessage | ErrorMessage;

export async function obey(session: WorkbenchSession, command: Command): Promise<Answer | undefined> {
  if (command.type === 'close') {
    session.closeComponent(command.tag);
    return undefined;
  }
  const opened = await session.open(command.file);
  if (isFailure(opened)) {
    const { code, message } = opened.diagnostic;
    return { v: 2, type: 'error', file: command.file, error: { code, message } };
  }
  return { v: 2, type: 'opened', ...opened };
}
