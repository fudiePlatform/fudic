/**
 * One listener per event type per root, instead of three per control (SDD-37 applied to
 * `@fudic/forms`).
 *
 * A form of twelve fields used to hold thirty-six listeners, and the count grew with the
 * markup: every `bind*` asked the element for `input`, `change` and `blur` of its own. The
 * technique that fixes it is the one the compiler already writes for a delegated `@click` —
 * a table keyed by NODE, one listener above them all, and a resolution by `composedPath()` —
 * so this module is that technique with the elements registering themselves instead of the
 * emit registering them.
 *
 * **`blur` is delegated as `focusout`.** `blur` does not bubble, so it never reaches a root
 * listener; `focusout` is the same moment and does. It is exactly the substitution `FUD0665`
 * names for an author who tries to delegate a `@blur`, applied to ourselves.
 *
 * The root listener is never taken back, and that is the point rather than an omission: it is
 * one per shadow root, it dies with the root, and removing it would mean counting registrations
 * to know when the last one left. What a binding takes back is its ROW in the table, which
 * costs no main-thread work at all.
 */

import type { Cleanup } from './types.js';

/** What a delegated registration listens to at the root, when the two differ (§4.4). */
const AT_ROOT: ReadonlyMap<string, string> = new Map([['blur', 'focusout']]);

/** The handlers of one root, by the event type they are dispatched from. */
type Tables = Map<string, WeakMap<EventTarget, (event: Event) => void>>;

/**
 * The tables of every root in play, keyed by the root itself.
 *
 * A `WeakMap` for the same reason the compiler's tables are: a shadow root that is thrown away
 * takes its entries with it, and nothing has to remember to clean up after a component that no
 * longer exists.
 */
const roots = new WeakMap<EventTarget, Tables>();

/**
 * Subscribe `handler` for `type` on `el`, through the delegation of its root.
 *
 * The signature is `on`'s, which is what lets the six `bind*` change one word each: they are
 * about a control and not about how a listener is wired, and the day this technique changes
 * again they must not have to know.
 *
 * `getRootNode()` and not `document`: a control lives in the shadow root of its component, and
 * a `change` does not cross a shadow boundary at all (`composed: false`). Listening where the
 * element actually is, is what makes the non-composed events arrive.
 */
export function delegate(el: Element, type: string, handler: (event: Event) => void): Cleanup {
  const at = AT_ROOT.get(type) ?? type;
  const root = el.getRootNode();

  let tables = roots.get(root);
  if (tables === undefined) {
    tables = new Map();
    roots.set(root, tables);
  }

  let table = tables.get(at);
  if (table === undefined) {
    table = new WeakMap();
    tables.set(at, table);
    root.addEventListener(at, dispatch(table));
  }

  table.set(el, handler);
  const registered = table;
  return () => {
    registered.delete(el);
  };
}

/**
 * The one listener: the first node of the composed path that has a handler wins.
 *
 * The path and not `event.target`, because a control is not always the deepest node the event
 * touches — a `<label>` click retargets, a custom control has a shadow of its own — and the
 * path is what crosses both. A node nobody registered resolves to nothing, which is what makes
 * an `<input>` this form does not own harmless inside the same root.
 */
function dispatch(table: WeakMap<EventTarget, (event: Event) => void>) {
  return (event: Event): void => {
    for (const node of event.composedPath()) {
      const handler = table.get(node);
      if (handler !== undefined) {
        handler(event);
        return;
      }
    }
  };
}
