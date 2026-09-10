/**
 * `bindCheckbox` — `<input type="checkbox">` (SDD-34 §4.2).
 *
 * The value is `checked`, never `value`: a checkbox's `value` attribute is what it CONTRIBUTES
 * to a `FormData` when it is on, and it is the string `"on"` when the author wrote none. What
 * the model holds is whether it is on.
 */

import { effect } from '@fudic/core';
import type { Control } from '../types.js';
import type { Cleanup, ErrorSlot } from './types.js';
import { bindErrors, on, undo } from './wiring.js';

export function bindCheckbox(
  el: HTMLInputElement,
  control: Control<boolean>,
  slot: ErrorSlot,
): Cleanup {
  const write = (): void => {
    control.set(el.checked);
  };
  return undo([
    on(el, 'input', write),
    on(el, 'change', write),
    on(el, 'blur', () => {
      control.touch();
    }),
    effect(() => {
      const value = control();
      if (el.checked !== value) el.checked = value;
    }),
    bindErrors([el], control, slot),
  ]);
}
