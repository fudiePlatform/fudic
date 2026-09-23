/**
 * `bindSelect` — a single-choice `<select>` (SDD-34 §4.2).
 *
 * Separate from `bindSelectMultiple` although both are a `<select>`, because they hold
 * different TYPES — a string and an array of strings — and folding them into one function
 * would put a branch on `el.multiple` in the bundle of every page that has a single select.
 * The compiler already knows which one it is: the attribute is in the markup.
 */

import { effect } from '@fudic/core';
import type { Control } from '../types.js';
import type { Cleanup, ErrorSlot } from './types.js';
import { bindErrors, follow, undo } from './wiring.js';

export function bindSelect(
  el: HTMLSelectElement,
  control: Control<string>,
  slot: ErrorSlot,
): Cleanup {
  return undo([
    ...follow([el], control, () => {
      control.set(el.value);
    }),
    effect(() => {
      const value = control();
      if (el.value !== value) el.value = value;
    }),
    bindErrors([el], control, slot),
  ]);
}
