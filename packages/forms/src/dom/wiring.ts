/**
 * What every bind function does the same way: listen, undo, and paint the error.
 *
 * The six `bind*` do not import each other — one shape of element knows nothing about
 * another — but they do share the two things that are the SAME fact in all six: a listener
 * has to be removable, and an error becomes `aria-invalid` plus a text in a slot the emit
 * already wrote. Writing that twice is how the checkbox and the text field end up announcing
 * an error differently.
 */

import { effect } from '@fudic/core';
import type { Control } from '../types.js';
import { delegate } from './delegation.js';
import type { Cleanup, ErrorSlot } from './types.js';

/**
 * Subscribe a listener and get its removal back.
 *
 * DELEGATED since SDD-37, and the six bindings did not have to know: a form of twelve fields
 * held thirty-six listeners because each of them asked its own element for `input`, `change`
 * and `blur`. Now the root holds one per event type and the element holds a row in a table,
 * which is the same technique the compiler writes for a delegated `@click` — and the same
 * saving, on the package where the most elements are alive at once.
 *
 * What a binding takes back is still its own registration and nothing else, so `undo` and every
 * caller of it are unchanged. `Element` and no longer `EventTarget`, because delegation needs a
 * root to listen at and only a node has one.
 */
export function on(el: Element, type: string, handler: (event: Event) => void): Cleanup {
  return delegate(el, type, handler);
}

/**
 * Subscribe a listener ON THE ELEMENT ITSELF, outside the delegation of its root.
 *
 * Delegation is paid for, and what it costs is this: a handler only runs if the event still
 * REACHES the root, so an author's `@input` that calls `stopPropagation()` silences the binding
 * underneath it. On a field that price is worth paying — there are twelve of them and the count
 * grows with the markup, which is the whole of SDD-37.
 *
 * On the `<form>` there is nothing to buy. A root holds ONE form in every page anybody writes,
 * so delegating its `submit` saves no listener at all — and it charges the same price: a
 * `@submit` that stops propagation, which is the ordinary way to write one, would take the
 * form's validation down with it and say nothing. One listener for one node, at the node.
 *
 * **In the capture phase** (BUG-41 §4.2). On the event's own target, capture listeners run
 * before bubble ones, so this runs ahead of the author's `@submit` on the same `<form>`
 * without the emit having to change the order it registers them in — and the author's handler
 * can read `defaultPrevented` to know the form was invalid, instead of sending it first.
 */
export function onSelf(el: Element, type: string, handler: (event: Event) => void): Cleanup {
  el.addEventListener(type, handler, true);
  return () => {
    el.removeEventListener(type, handler, true);
  };
}

/** Fold a list of teardowns into the one `Cleanup` a binding returns. */
export function undo(all: readonly Cleanup[]): Cleanup {
  return () => {
    for (const off of all) off();
  };
}

/**
 * The element → control half of every binding: `input` and `change` write, `blur` leaves.
 *
 * **Late to accuse, quick to forgive** (BUG-41 §4.1), and written ONCE so the seven bindings
 * cannot drift apart on it:
 *
 * - leaving the field touches it and validates it — the error appears when the user is done
 *   with the field, never while they are still typing it for the first time;
 * - a write revalidates only when the error is ON SCREEN, so a corrected value takes its
 *   message away at the keystroke that corrects it. A field whose error is not showing is not
 *   validated per keystroke: it is unfilled, not wrong.
 *
 * `read` is the coercion of each shape — the only thing the bindings do differently.
 */
export function follow(
  targets: readonly Element[],
  control: Control<unknown>,
  read: () => void,
): Cleanup[] {
  const edit = (): void => {
    read();
    if (control.touched() && control.errors() !== null) void control.validate();
  };
  const leave = (): void => {
    control.touch();
    void control.validate();
  };
  return targets.flatMap((el) => [on(el, 'input', edit), on(el, 'change', edit), on(el, 'blur', leave)]);
}

/**
 * The accessibility half of every binding (§4.2, step 4): `aria-invalid` on the element and
 * the message in the element the author marked for it.
 *
 * **Only when the control is `touched`.** A required field is not WRONG for being still
 * empty; it is unfilled. Painting the error on first render is how a form greets a user with
 * six red messages for six fields they have not reached yet, and a screen reader with six
 * announcements.
 *
 * `targets` is a list because a radio group is N elements expressing one value, and all of
 * them carry the state of that value. Everything else passes one.
 *
 * The slot is only ever WRITTEN, never created: it is the author's own element, in the HTML
 * the server sent, with the `aria-describedby` that points at it. `null` when the author wrote
 * none — then there is no text to write, and `aria-invalid` is still the element's own.
 */
export function bindErrors(
  targets: readonly Element[],
  control: Control<unknown>,
  slot: ErrorSlot,
): Cleanup {
  return effect(() => {
    const show = control.touched() && control.errors() !== null;
    const text = show ? control.message() : '';
    // Compared before writing, like every other write in this module: replacing the text of a
    // node a screen reader is reading is an announcement, even when the text is the same one.
    if (slot !== null && slot.textContent !== text) slot.textContent = text;
    for (const target of targets) {
      if (show) target.setAttribute('aria-invalid', 'true');
      else target.removeAttribute('aria-invalid');
    }
  });
}
