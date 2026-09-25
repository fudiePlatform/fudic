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
 * lands, with no IDREF involved. A summary with `fields` is the other answer (BUG-42 §4.7): the
 * focus goes to it, and each of its entries links to its field.
 */

import { internalsOf } from '../internals.js';
import type { AnyForm, AnyNode } from '../types.js';
import { bindSummary } from './summary.js';
import type { Cleanup } from './types.js';
import { onSelf, undo } from './wiring.js';

/**
 * The first failing field of the form, in tree order — the order `elements` lists them in.
 *
 * Two marks, because a field can live in two trees. A field in the form's own tree carries the
 * `aria-invalid` its error effect wrote. A control-component's `<input>` lives in ITS shadow root,
 * where nothing from here reaches — but its host is a listed element of this form, its
 * `validity` is the one `setValidity` keeps, and focusing the host lands in the `<input>` through
 * `delegatesFocus`. A fieldset is never invalid by its own `validity`: it is barred from
 * constraint validation, whatever it contains. A listed element with no `validity` at all — a
 * form-associated element that does not expose it — is not one this can judge.
 */
function firstInvalid(el: HTMLFormElement): HTMLElement | undefined {
  return [...el.elements].find(
    (field) =>
      field.getAttribute('aria-invalid') === 'true' ||
      (field as { readonly validity?: ValidityState }).validity?.valid === false,
  ) as HTMLElement | undefined;
}

/**
 * `summary` is the element the author marked with `summary="@form"`, or `null`. `links` is the
 * map path → id the emit writes for a summary with `fields`, and `null` without it (BUG-42 §4.7).
 */
export function bindForm(
  el: HTMLFormElement,
  form: AnyForm,
  summary: HTMLElement | null,
  links: Readonly<Record<string, string>> | null = null,
): Cleanup {
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
      // Every attempt counts: it is what lets a summary with `fields` list the errors of the
      // fields — a summary sums up a submit, it does not chase the user field by field.
      internalsOf(form as unknown as AnyNode).markSubmitted();
      void form.$validate();
      if (form.$errors() === null && form.$summary() === null) return;
      event.preventDefault();
      // Cascade first: errors are hidden until a control is touched (§4.2), so without this
      // the user would be stopped by errors they cannot see.
      form.$touch();
      // With a summary that lists the fields, the focus goes to IT: the user hears every error
      // at once and each one links to its field (BUG-42 §4.7). Without one, to the first field.
      if (summary !== null && links !== null) summary.focus();
      else firstInvalid(el)?.focus();
    }),
  ];
  // Into the live region the author marked with `summary="@form"`. A text that changes INSIDE a
  // live region is announced; the same text changing outside one is not, which is why the
  // element exists in the markup before this runs, `aria-live` included.
  if (summary !== null) offs.push(bindSummary(summary, form, links));
  return undo(offs);
}
