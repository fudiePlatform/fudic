/**
 * `bindText` — the string shape: `<input>` with a textual `type`, and `<textarea>`
 * (SDD-34 §4.2).
 *
 * The four steps are the same in all six bindings and only the coercion differs, which is the
 * whole reason there are six modules and not one function with a `switch`: the page that has
 * one text field downloads this and nothing else.
 */

import { effect } from '@fudic/core';
import type { Control } from '../types.js';
import type { Cleanup, ErrorSlot } from './types.js';
import { bindErrors, on, undo } from './wiring.js';

export function bindText(
  el: HTMLInputElement | HTMLTextAreaElement,
  control: Control<string>,
  slot: ErrorSlot,
): Cleanup {
  const write = (): void => {
    control.set(el.value);
  };
  return undo([
    // `input` for every keystroke and `change` for what does not raise one — a browser
    // autofill, a datalist pick — so the model never lags behind what the user can see.
    on(el, 'input', write),
    on(el, 'change', write),
    on(el, 'blur', () => {
      control.touch();
    }),
    // Control → element, for the writes that did not come from the user: a `$patch`, a
    // `$reset`, a value loaded from the server.
    //
    // Guarded by equality for the reason `$w` exists in BUG-12: assigning `value` on a
    // focused input moves the caret to the end, so re-writing the string the element already
    // holds would jump the cursor on every unrelated notification.
    effect(() => {
      const value = control();
      if (el.value !== value) el.value = value;
    }),
    bindErrors([el], control, slot),
  ]);
}
