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
 */
export function onSelf(el: Element, type: string, handler: (event: Event) => void): Cleanup {
  el.addEventListener(type, handler);
  return () => {
    el.removeEventListener(type, handler);
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
 * its stable id and the `aria-describedby` that points at it (decision 113). That is the
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
