/**
 * The positions the root may not answer (BUG-23, TODOs 1 and 2).
 *
 * A `.fud` is HTML with `@` in it, so the HTML service is mounted over the whole file and it
 * is right about almost every position in it. The exceptions are the closed positions of the
 * grammar — a prop after `.`, an event after `@`, a member after a `.` in an expression —
 * where the only correct list is TypeScript's over the projection.
 *
 * Saying nothing there is not the same as being silent, and that difference is this module:
 *
 *     if (!completionList || !completionList.items.length) continue;   // Volar
 *     …
 *     if (!isAdditional) mainCompletionUri = document.uri;
 *
 * A plugin whose list comes back EMPTY does not claim the position — Volar moves on to the
 * next document, and the root is walked LAST, after every embedded code. So a component whose
 * contract has no member to offer, or a `data` whose type has nothing under the dot, handed
 * the turn straight to the HTML service, which filled the silence with `class`, `id`, `role`
 * and the rest of HTML's vocabulary. That is the list in the user's screenshot, and no amount
 * of fixing the projection could have removed it: the projection was never asked.
 *
 * Hence a decorator rather than a branch. The service keeps every other position it owns.
 */

import type { LanguageServicePlugin } from '@volar/language-service';
import { regionAt } from '@fudic/compiler';
import { fudicDocumentOf } from './plugin.js';
import { ownedByProjection } from './position.js';

/**
 * Wrap a service so it declines the positions that belong to the projection.
 *
 * Completion only: hover, diagnostics and the rest of what the HTML service does at those
 * offsets are either harmless or already mapped, and a decorator that removed them would be
 * turning off features to fix a list.
 */
export function silenceOwnedPositions(plugin: LanguageServicePlugin): LanguageServicePlugin {
  return {
    ...plugin,
    create(context) {
      const instance = plugin.create(context);
      const inner = instance.provideCompletionItems?.bind(instance);
      if (inner === undefined) return instance;

      return {
        ...instance,
        provideCompletionItems(document, position, completionContext, token) {
          const cached = fudicDocumentOf(context, document);
          if (cached !== undefined) {
            const offset = document.offsetAt(position);
            const region = regionAt(cached.source, cached.html, offset);
            if (ownedByProjection(cached.source, offset, region)) return undefined;
          }
          return inner(document, position, completionContext, token);
        },
      };
    },
  };
}
