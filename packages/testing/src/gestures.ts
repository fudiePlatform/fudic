/**
 * The gestures of a mounted component or page (§3.3, §4.7): Testing Library's `user-event`,
 * and each one resolves only when nothing it set off is still running — the requests to the
 * in-memory server, the chunks hydration is importing, the microtasks of the signals.
 */

import { userEvent } from '@testing-library/user-event';
import { settled } from './pending.js';

/** What a test does to a mounted root. */
export interface Gestures {
  click(target: Element): Promise<void>;
  type(target: Element, text: string): Promise<void>;
  clear(target: Element): Promise<void>;
  blur(target: Element): Promise<void>;
  /** Submit `form`, or the one form under the root. */
  submit(form?: Element): Promise<void>;
  /** Wait until nothing is pending. */
  settled(): Promise<void>;
}

/** The forms under `root`, shadow roots included. */
function formsOf(root: ParentNode): HTMLFormElement[] {
  const out: HTMLFormElement[] = [...root.querySelectorAll('form')];
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot !== null) out.push(...formsOf(el.shadowRoot));
  }
  return out;
}

/** The gestures on `root`. */
export function gesturesOf(root: ParentNode): Gestures {
  // Set up on the first gesture, since most mounts only read; and with no delay between
  // keystrokes: a unit test waits for what the gesture set off, not for a clock.
  let session: ReturnType<typeof userEvent.setup> | undefined;
  const user = (): ReturnType<typeof userEvent.setup> => (session ??= userEvent.setup({ delay: null, document }));
  const then = async (gesture: Promise<void>): Promise<void> => {
    await gesture;
    await settled();
  };
  return {
    click: (target) => then(user().click(target)),
    type: (target, text) => then(user().type(target, text)),
    // `user.clear` checks the focus against `document.activeElement`, which is the HOST when the
    // control lives in a shadow root, and gives up. Selecting all and deleting is the same
    // gesture, and `type` focuses the control itself.
    clear: (target) => {
      const length = (target as HTMLInputElement).value.length;
      return then(user().type(target, '{Backspace}', { initialSelectionStart: 0, initialSelectionEnd: length }));
    },
    blur: (target) => {
      // A control loses the focus it has: it is given it first, as the user's tab did.
      (target as HTMLElement).focus();
      (target as HTMLElement).blur();
      return settled();
    },
    submit: (form) => {
      const forms = form === undefined ? formsOf(root) : [form];
      if (forms.length !== 1) {
        throw new Error(`submit() needs the form to submit: there are ${String(forms.length)} under the root`);
      }
      const target = forms[0] as HTMLFormElement;
      // As the user submits: by clicking its submit button. A `submit` event does not cross the
      // shadow boundary, so hydration would never hear one fired at a form nobody touched; the
      // click it hears, raises the component and replays. A form with no button is submitted
      // the way Enter would.
      const button = target.querySelector<HTMLElement>('button:not([type]), button[type="submit"], input[type="submit"]');
      if (button !== null) return then(user().click(button));
      target.requestSubmit();
      return settled();
    },
    settled,
  };
}
