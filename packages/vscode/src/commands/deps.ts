/**
 * What every command is given (SDD-25 §4.3).
 */

import { NO_ACTIVE_FUD, SERVER_DOWN } from './messages.js';
import type { FudicSession } from '../activate.js';
import type {
  DocumentsPort,
  EditorPort,
  FormatterPort,
  LoggerPort,
  NotificationPort,
} from '../ports.js';

export interface CommandDeps {
  readonly session: FudicSession;
  readonly editor: EditorPort;
  readonly documents: DocumentsPort;
  readonly formatter: FormatterPort;
  readonly notifications: NotificationPort;
  readonly logger: LoggerPort;
}

/**
 * The active `.fud` and a live server, or the reason there is neither.
 *
 * Both debugging commands need exactly this pair, and both have to answer for its absence.
 * Doing the check once means the two of them cannot drift into saying different things
 * about the same state.
 */
export const requireFudAndServer = (
  deps: CommandDeps,
): { readonly uri: string } | { readonly problem: string } => {
  const uri = deps.editor.activeFudUri();
  if (uri === undefined) return { problem: NO_ACTIVE_FUD };
  if (!deps.session.running) return { problem: SERVER_DOWN };
  return { uri };
};
