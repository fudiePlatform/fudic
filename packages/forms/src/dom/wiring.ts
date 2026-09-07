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
import { errorText } from '../messages.js';
import type { Cleanup, ErrorSlot } from './types.js';

/** Subscribe a listener and get its removal back. */
export function on(
  target: EventTarget,
  type: string,
  handler: (event: Event) => void,
): Cleanup {
  target.addEventListener(type, handler);
  return () => {
    target.removeEventListener(type, handler);
  };
}

/** Fold a list of teardowns into the one `Cleanup` a binding returns. */
export function undo(all: readonly Cleanup[]): Cleanup {
  return () => {
    for (const off of all) off();
  };
}

/**
 * The accessibility half of every binding (§4.2, step 4): `aria-invalid` on the element and
 * the message in the slot the emit left in the markup.
 *
 * **Only when the control is `touched`.** A required field is not WRONG for being still
 * empty; it is unfilled. Painting the error on first render is how a form greets a user with
 * six red messages for six fields they have not reached yet, and a screen reader with six
 * announcements.
 *
 * `targets` is a list because a radio group is N elements expressing one value, and all of
 * them carry the state of that value. Everything else passes one.
 *
 * The slot is only ever WRITTEN, never created: it exists in the HTML the server sent, with
 * its stable id and the `aria-describedby` that points at it (decision 111). That is the
 * invariant §6.10 measures.
 */
export function bindErrors(
  targets: readonly Element[],
  control: Control<unknown>,
  slot: ErrorSlot,
): Cleanup {
  return effect(() => {
    const errors = control.errors();
    const show = control.touched() && errors !== null;
    const text = show ? errorText(errors) : '';
    // Compared before writing, like every other write in this module: replacing the text of a
    // node a screen reader is reading is an announcement, even when the text is the same one.
    if (slot.textContent !== text) slot.textContent = text;
    for (const target of targets) {
      if (show) target.setAttribute('aria-invalid', 'true');
      else target.removeAttribute('aria-invalid');
    }
  });
}
