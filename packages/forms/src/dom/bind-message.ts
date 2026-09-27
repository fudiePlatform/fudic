/**
 * `bindMessage` — the message of a control that THIS template does not bind (BUG-42 §4.9).
 *
 * `<app-error error=@f.email>` next to `<app-input control=@f.email>`: the control crosses into
 * a control-component, and it is the child that binds it. The marker still lives here, in the
 * parent's tree, so it is the parent that writes its text — with the same rule the seven `bind*`
 * follow for their own marker: the message once the field is touched, nothing before.
 *
 * The text lands in the marker's light DOM. A wrapper like `app-error` paints it with a `<slot>`,
 * and with no message the host is empty and `:host(:empty)` hides it.
 */

import { effect } from '@fudic/core';
import type { Control } from '../types.js';
import type { Cleanup } from './types.js';
import { shown, write } from './wiring.js';

export function bindMessage(slot: HTMLElement, control: Control<unknown>): Cleanup {
  return effect(() => {
    write(slot, shown(control) ? control.message() : '');
  });
}
