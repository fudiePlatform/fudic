/**
 * `fudic.formatDocument` (SDD-25 §4.3).
 *
 * Formatting is delegated all the way down: the command asks the editor to format, the
 * editor routes to the default formatter — which the `[fudic]` defaults set to this
 * extension — and the extension routes to the server, which is where SDD-26 lives. Nothing
 * about *how* a `.fud` is formatted exists in this package, which is the point of §5.
 */

import { FORMAT_DISABLED, NO_ACTIVE_FUD } from './messages.js';
import type { CommandDeps } from './deps.js';

export const formatDocument = async (deps: CommandDeps): Promise<void> => {
  if (!deps.session.settings.formatEnable) {
    deps.notifications.warn(FORMAT_DISABLED);
    return;
  }
  if (deps.editor.activeFudUri() === undefined) {
    deps.notifications.warn(NO_ACTIVE_FUD);
    return;
  }

  // Not gated on the server being up: with the server down the editor simply finds no
  // formatter and does nothing, which is the same outcome and one branch fewer.
  await deps.formatter.formatActiveDocument();
};
