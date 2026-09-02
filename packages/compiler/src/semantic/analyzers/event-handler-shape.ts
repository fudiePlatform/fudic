/**
 * `event-handler-shape` (decisions 96–98): the value of an `@event` / `bus:` binding must be
 * one of the four shapes a listener can take — a reference, a call, a lambda or a function.
 * Anything else is `FUD0291`.
 *
 * The rule itself is `handlerShape`'s, which the emit applies too: one definition, and this
 * analyzer is only the place it is REPORTED from. That is the whole of BUG-23 §2.4's second
 * half — the rule lived inside the emit, so the error only ever appeared in `pnpm build` and
 * the editor stayed silent over the very line being typed.
 *
 * Only a value with an AST is judged. A fragment that failed to parse has `FUD0170` already,
 * and one nobody registered cannot be asked about: silence is the honest answer, not a
 * complaint about a value this pass could not read.
 */

import { errorDiag } from '../../types/index.js';
import { handlerShape } from '../../binding/index.js';
import type { OxcNode } from '../../oxc/index.js';
import type { Analyzer } from '../model.js';
import { documentRoots, walk } from '../walk.js';

const FUD_UNSUITABLE_HANDLER = 'FUD0291';

/** The prefixes whose value is a handler: an event, and a bus subscription. */
const EVENT_PREFIX = '@';
const BUS_PREFIX = 'bus:';

export const eventHandlerShape: Analyzer = {
  name: 'event-handler-shape',
  run(input, report) {
    walk(documentRoots(input.document), {
      binding(expr, attr) {
        if (typeof attr.name === 'string') {
          const named = attr.name.startsWith(EVENT_PREFIX) || attr.name.startsWith(BUS_PREFIX);
          if (!named) return;
        } else if (attr.name === expr) {
          // A `bus:( … )` names its event with an expression too, and that one is not the
          // handler: it is a value, and any shape of value names an event.
          return;
        }

        const id = input.fragmentId(expr);
        if (id === undefined) return;
        const root = input.js.ast(id);
        if (Array.isArray(root)) return; // an expression fragment is a single node

        if (handlerShape(root as OxcNode) === 'unsuitable') {
          report(
            errorDiag(
              FUD_UNSUITABLE_HANDLER,
              'an event handler must be a reference, a call, a lambda or a function',
              expr.span,
            ),
          );
        }
      },
    });
  },
};
