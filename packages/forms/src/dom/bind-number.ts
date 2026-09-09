/**
 * `bindNumber` — `<input type="number">` and `<input type="range">` (SDD-34 §4.2).
 *
 * **The empty field is `null`, not `NaN` and not `0`.** An `<input type="number">` whose value
 * is `''` is a field the user has not filled, and that is a different fact from a field
 * holding zero: `Number('')` is `0`, which would make an untouched price look like a free
 * product, and `NaN` would make every comparison in a validator false. `null` is the same
 * empty SDD-33's numeric factories declare (`TypedControl<number | null>`), so the model and
 * the element agree on what nothing means.
 */

import { effect } from '@fudic/core';
import type { Control } from '../types.js';
import type { Cleanup, ErrorSlot } from './types.js';
import { bindErrors, on, undo } from './wiring.js';

export function bindNumber(
  el: HTMLInputElement,
  control: Control<number | null>,
  slot: ErrorSlot,
): Cleanup {
  const write = (): void => {
    control.set(el.value === '' ? null : Number(el.value));
  };
  return undo([
    on(el, 'input', write),
    on(el, 'change', write),
    on(el, 'blur', () => {
      control.touch();
    }),
    effect(() => {
      const value = control();
      // Back through the same door it came: `null` is the empty string, which is what an
      // `<input type="number">` shows for «nothing».
      const text = value === null ? '' : String(value);
      if (el.value !== text) el.value = text;
    }),
    bindErrors([el], control, slot),
  ]);
}
