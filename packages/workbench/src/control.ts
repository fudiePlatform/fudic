/**
 * The commands a workbench obeys from its parent process, one JSON line each on stdin: open and
 * close components, and the same run, pin, pause and cancel a shell sends over its socket.
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
  if (command.type !== 'open') {
    session.command(command);
    return undefined;
  }
  const opened = await session.open(command.file);
  if (isFailure(opened)) {
    const { code, message } = opened.diagnostic;
    return { v: 2, type: 'error', file: command.file, error: { code, message } };
  }
  return { v: 2, type: 'opened', file: command.file, ...opened };
}
