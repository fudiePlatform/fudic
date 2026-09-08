/**
 * `bindRadio` — a radio GROUP: N elements expressing one value (SDD-34 §4.2, decision 110).
 *
 * It is the one binding that takes a list, and the reason is the element and not the compiler:
 * a radio group is how HTML writes a single choice, so several `control` on the same form node
 * are legitimate here and nowhere else. The emit gathers them at compile time and writes ONE
 * call with the list — there is no scan of the DOM for a shared `name`.
 *
 * The state is shared: `aria-invalid` goes on every radio of the group, because each of them
 * carries the state of the one value they express.
 */

import { effect } from '@fudic/core';
import type { Control } from '../types.js';
import type { Cleanup, ErrorSlot } from './types.js';
import { bindErrors, on, undo } from './wiring.js';

export function bindRadio(
  els: readonly HTMLInputElement[],
  control: Control<string>,
  slot: ErrorSlot,
): Cleanup {
  const write = (): void => {
    // The checked one, or the empty string: a group with nothing chosen holds no value, and
    // that is what a `required` on it is for.
    const chosen = els.find((el) => el.checked);
    control.set(chosen === undefined ? '' : chosen.value);
  };
  const offs: Cleanup[] = [];
  for (const el of els) {
    offs.push(on(el, 'input', write));
    offs.push(on(el, 'change', write));
    offs.push(
      on(el, 'blur', () => {
        control.touch();
      }),
    );
  }
  offs.push(
    effect(() => {
      const value = control();
      for (const el of els) {
        const checked = el.value === value;
        if (el.checked !== checked) el.checked = checked;
      }
    }),
  );
  offs.push(bindErrors(els, control, slot));
  return undo(offs);
}
