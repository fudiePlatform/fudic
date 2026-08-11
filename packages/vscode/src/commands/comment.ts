/**
 * `fudic.toggleComment` — Ctrl+/ that knows which language it is in (BUG-22 §5).
 *
 * VS Code takes the delimiters from `language-configuration.json`, one set per language, and a
 * `.fud` is three. So the shortcut wrote `@* *@` inside `@code` and inside `<style>`, where it
 * is a syntax error rather than a comment. The editor cannot switch that per region, so the
 * command replaces it: it asks the server which delimiters belong under the caret and toggles
 * them itself.
 *
 * Bound over Ctrl+/ only for `.fud`, so every other file keeps the editor's own behaviour.
 */

import { toggleComment } from '../comment.js';
import { NO_ACTIVE_FUD, requestFailed, SERVER_DOWN } from './messages.js';
import type { CommandDeps } from './deps.js';
import type { CommentSyntax } from '../ports.js';

export const COMMENT_SYNTAX_REQUEST = 'fudic/commentSyntax';

export const toggleCommentCommand = async (deps: CommandDeps): Promise<void> => {
  const selection = deps.selection.current();
  if (selection === undefined) {
    deps.notifications.warn(NO_ACTIVE_FUD);
    return;
  }
  if (!deps.session.running) {
    deps.notifications.warn(SERVER_DOWN);
    return;
  }

  let syntax: CommentSyntax;
  try {
    syntax = await deps.session.client.sendRequest<CommentSyntax>(COMMENT_SYNTAX_REQUEST, {
      uri: selection.uri,
      offset: selection.offset,
    });
  } catch (error) {
    deps.notifications.warn(requestFailed(COMMENT_SYNTAX_REQUEST, error));
    return;
  }

  await deps.selection.replaceLines(
    toggleComment(selection.lines, selection.firstLine, selection.lastLine, syntax),
  );
};
