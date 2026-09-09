/**
 * `bindSelectMultiple` — `<select multiple>`, whose value is an ARRAY of strings
 * (SDD-34 §4.2).
 *
 * A multiple select has no single `value` to read or write: the state lives one per `<option>`,
 * in `selected`. So both directions go through the options, and the write back sets each one
 * to what the model says rather than assigning something to the select.
 */

import { effect } from '@fudic/core';
import type { Control } from '../types.js';
import type { Cleanup, ErrorSlot } from './types.js';
import { bindErrors, on, undo } from './wiring.js';

export function bindSelectMultiple(
  el: HTMLSelectElement,
  control: Control<readonly string[]>,
  slot: ErrorSlot,
): Cleanup {
  const write = (): void => {
    const chosen: string[] = [];
    for (const option of el.options) {
      if (option.selected) chosen.push(option.value);
    }
    control.set(chosen);
  };
  return undo([
    on(el, 'input', write),
    on(el, 'change', write),
    on(el, 'blur', () => {
      control.touch();
    }),
    effect(() => {
      const value = control();
      for (const option of el.options) {
        // Per option, and compared first: `selected = selected` still counts as an attribute
        // write, and a select being rebuilt under a screen reader is an announcement.
        const selected = value.includes(option.value);
        if (option.selected !== selected) option.selected = selected;
      }
    }),
    bindErrors([el], control, slot),
  ]);
}
