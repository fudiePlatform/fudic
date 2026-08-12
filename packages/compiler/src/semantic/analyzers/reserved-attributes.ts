/**
 * `reserved-attributes` — the `data-fud-*` namespace belongs to the compiler (SDD-15 §3.1).
 *
 * This is the HTML half of the reservation `FUD0290` enforces in JavaScript. The emit writes
 * markers onto the hosts it fabricates — `data-fud-id`, the instance identity the whole
 * hydration runtime indexes by, and `data-fud-adopt`, the style specifier the polyfill reads —
 * and both live in `data-*`, which is otherwise the AUTHOR's vocabulary. Prefixing them is
 * what separates the two worlds; saying so is what makes the prefix mean anything.
 *
 * The failure it prevents is silent and reaches production. A `data-fud-id` written by hand is
 * an extra hit in the runtime's `[data-fud-id]` query, an id that indexes a payload slice
 * nobody reserved, and a hydration started against a slice that does not exist. Nothing
 * throws, nothing logs, and the component simply does not come alive.
 *
 * Three decisions, and each one is the reason the rule is not simpler:
 *
 * - **The whole namespace, not today's two names.** Reserving only `data-fud-id` and
 *   `data-fud-adopt` would mean that the day a third marker is emitted, every page that
 *   happened to use that name breaks — and breaks at the version bump, where nobody is
 *   looking. A namespace is reserved whole or it is not reserved.
 * - **`data-fud-space` is the exception, because it is the author's on purpose.** It is the
 *   escape hatch of BUG-07 §4.4: `white-space` inherits across the shadow boundary, so no
 *   single file can deduce that a subtree must keep its whitespace, and the author is the one
 *   who knows. It is written in `fud`'s namespace precisely because it addresses the
 *   compiler.
 * - **A `.prop` counts.** Since BUG-16 §4.1 a `.prop` is written onto the host as an
 *   attribute — level 1 is HTML with no JS, so there is nowhere else for it to go — and
 *   `.data-fud-id="9"` lands in the document as exactly the attribute this rule forbids.
 *
 * The comparison folds case, unlike `duplicate-attributes` next door: that one compares
 * verbatim because `.prop` and `@evt` names are case-sensitive, whereas an ATTRIBUTE name is
 * not — the DOM lowercases it, so `DATA-FUD-ID` is the same marker with a different spelling.
 */

import { errorDiag } from '../../types/index.js';
import type { Analyzer } from '../model.js';
import { documentRoots, walk } from '../walk.js';

const FUD_RESERVED_ATTRIBUTE = 'FUD0294';

/** The reserved namespace, and the one name inside it the author is meant to write. */
const RESERVED_PREFIX = 'data-fud-';
const AUTHORED: ReadonlySet<string> = new Set(['data-fud-space']);

/**
 * The attribute name a written binding ends up as in the document, or `undefined` when the
 * binding cannot land as one.
 *
 * A leading `.` is a property (BUG-16: written on the host as an attribute of that name). A
 * leading `@` is an event and `bus:` is a subscription — neither reaches the document, and a
 * `bus:(expr)` name is not even a string. Nothing else is stripped: the rule is about the
 * name that gets serialized.
 */
function attributeName(name: string): string | undefined {
  if (name.startsWith('@') || name.startsWith('bus:')) return undefined;
  return (name.startsWith('.') ? name.slice(1) : name).toLowerCase();
}

export const reservedAttributes: Analyzer = {
  name: 'reserved-attributes',
  run(input, report) {
    walk(documentRoots(input.document), {
      element(el) {
        for (const attr of el.attributes) {
          if (typeof attr.name !== 'string') continue;
          const written = attributeName(attr.name);
          if (written === undefined) continue;
          if (!written.startsWith(RESERVED_PREFIX) || AUTHORED.has(written)) continue;
          report(
            errorDiag(
              FUD_RESERVED_ATTRIBUTE,
              `\`${attr.name}\` is reserved: the \`data-fud-\` namespace belongs to the compiler. Use a \`data-\` name of your own.`,
              attr.span,
            ),
          );
        }
      },
    });
  },
};
