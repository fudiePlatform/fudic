/**
 * `bindForm` — the `<form>` itself: STATE, never action (SDD-34 §4.4).
 *
 * It sends only when it is told where: `form:=@save` hands it the server function (SDD-56
 * §4.7), and then a valid submit calls it instead of navigating. Without it, who submits the
 * data and where is the author's (`@submit`, decision 96) or the native `<form>`'s. What this
 * binds besides is the three things that are about the FORM and not about any one field:
 * making the hidden errors visible, moving the focus to the first that failed, and announcing
 * the summary.
 *
 * **Why the focus moves.** `aria-describedby` does not cross a shadow boundary, so a summary
 * living in the form's tree cannot describe a field living inside a control-component's. The
 * portable answer is to put the caret on the failing field: focus is announced wherever it
 * lands, with no IDREF involved. A summary with `fields` is the other answer (BUG-42 §4.7): the
 * focus goes to it, and each of its entries links to its field.
 */

import { internalsOf } from '../internals.js';
import { SERVER_RULE } from '../messages.js';
import type { AnyForm, AnyNode, ErrorMap, Errors } from '../types.js';
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
 * A refusal of the server, recognised by its shape: `@fudic/http`'s `HttpError` is a class of a
 * package this one does not depend on, and the form only needs what it carries.
 */
interface Refusal {
  readonly status: number;
  /** A 422's errors by path; absent on any other status. */
  readonly errors?: ErrorMap | null;
  readonly summary?: Errors | null;
  /** The problem (RFC 9457) it came with: `{ status, title, detail? }`. */
  readonly problem?: { readonly status: number; readonly title: string; readonly detail?: string };
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { readonly status?: unknown } | null | undefined)?.status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * Paint a refusal the form keeps: a 422's errors where they belong, or — a 409, a 400 with
 * nothing per field — the server's sentence as the form's own error, under `SERVER_RULE`.
 */
function keep(form: AnyForm, refusal: Refusal): void {
  if (refusal.errors !== undefined && refusal.errors !== null) {
    form.$setErrors(refusal.errors, refusal.summary ?? null);
    return;
  }
  const problem = refusal.problem ?? { status: refusal.status, title: String(refusal.status) };
  form.$setErrors({}, { [SERVER_RULE]: problem });
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
  send?: (form: AnyForm) => Promise<unknown>,
): Cleanup {
  // Make the errors visible and move the focus: to the summary that lists the fields, if there
  // is one (BUG-42 §4.7), or to the first field that failed.
  const stop = (): void => {
    // Cascade first: errors are hidden until a control is touched (§4.2), so without this
    // the user would be stopped by errors they cannot see.
    form.$touch();
    if (summary !== null && links !== null) summary.focus();
    else firstInvalid(el)?.focus();
  };
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
      const valid = form.$errors() === null && form.$summary() === null;
      if (valid && send === undefined) return;
      event.preventDefault();
      if (!valid) {
        stop();
        return;
      }
      // `form:=@save` (SDD-56 §4.7): a valid form is SENT, never navigated with. A status the
      // form keeps (`catches`: 400, 409 and 422 unless it says otherwise) goes into it like a
      // client error; anything else is announced on the `<form>`, where the view listens with
      // `@fudic:result` / `@fudic:error`.
      void send!(form).then(
        (value) => {
          el.dispatchEvent(new CustomEvent('fudic:result', { detail: value, bubbles: true }));
        },
        (error: unknown) => {
          const status = statusOf(error);
          if (status !== undefined && form.$catches(status)) {
            keep(form, error as Refusal);
            stop();
            return;
          }
          el.dispatchEvent(new CustomEvent('fudic:error', { detail: error, bubbles: true }));
        },
      );
    }),
  ];
  // Into the live region the author marked with `summary="@form"`. A text that changes INSIDE a
  // live region is announced; the same text changing outside one is not, which is why the
  // element exists in the markup before this runs, `aria-live` included.
  if (summary !== null) offs.push(bindSummary(summary, form, links));
  return undo(offs);
}
