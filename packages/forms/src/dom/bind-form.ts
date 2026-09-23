/**
 * `bindForm` — the `<form>` itself: STATE, never action (SDD-34 §4.4).
 *
 * Nothing here sends anything. Who submits the data and where is the author's (`@submit`,
 * decision 96) or the native `<form>`'s, and the day `@fudic/http` exists it will be its. What
 * this binds is the three things that are about the FORM and not about any one field: making
 * the hidden errors visible, moving the focus to the first that failed, and announcing the
 * summary.
 *
 * **Why the focus moves.** `aria-describedby` does not cross a shadow boundary, so a summary
 * living in the form's tree cannot describe a field living inside a control-component's. The
 * portable answer is to put the caret on the failing field: focus is announced wherever it
 * lands, with no IDREF involved. `Reference Target` is the standard's own answer and it is not
 * available yet (§7).
 */

import { effect } from '@fudic/core';
import type { AnyForm } from '../types.js';
import { errorText } from '../messages.js';
import type { Cleanup } from './types.js';
import { onSelf, undo } from './wiring.js';

/** What the error effects marked. The first in DOCUMENT order is what `querySelector` gives. */
const INVALID = '[aria-invalid="true"]';

export function bindForm(el: HTMLFormElement, form: AnyForm, summary: HTMLElement | null): Cleanup {
  const offs: Cleanup[] = [
    // `onSelf` and not `on`: the form's `submit` is the one subscription in this package that
    // delegation cannot pay for. There is one form per root, so the root would hold the same
    // single listener it holds now — and an author's `@submit` that calls `stopPropagation()`
    // would stop the event before the root ever saw it, which is this validation, gone quietly.
    onSelf(el, 'submit', (event) => {
      // **Validate first, then decide on what is known NOW** (BUG-41 §4.2). `$validate`
      // publishes every rule that answers synchronously before it returns, so a `required` on
      // an empty field stops the very first submit, and an error the user has since corrected
      // is gone before the decision reads it. Only an asynchronous rule answers too late to
      // count; its verdict lands on record for the next submit, and it cannot un-send this one.
      //
      // That is not a resignation. The one who decides is the server — that is what the
      // server validators and the 422 are for (§4.7, SDD-33 §4.6). The client check is a
      // courtesy, and a courtesy that blocks the form while it thinks is worse than none.
      void form.$validate();
      if (form.$errors() === null && form.$summary() === null) return;
      event.preventDefault();
      // Cascade first: errors are hidden until a control is touched (§4.2), so without this
      // the user would be stopped by errors they cannot see.
      form.$touch();
      const first = el.querySelector<HTMLElement>(INVALID);
      first?.focus();
    }),
  ];
  if (summary !== null) {
    offs.push(
      effect(() => {
        // Into the live region the emit left beside the form. A text that changes INSIDE a
        // live region is announced; the same text changing outside one is not, which is why
        // the element is the emit's and not something fabricated here.
        const errors = form.$summary();
        const text = errors === null ? '' : errorText(errors);
        if (summary.textContent !== text) summary.textContent = text;
      }),
    );
  }
  return undo(offs);
}
