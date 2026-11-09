/**
 * `bindFile` — `<input type="file">`, bound to a `file` or, with `multiple`, a `file[]`
 * (SDD-81 §3.7, decision 182).
 *
 * Element → control: what the dialog of the system chose, as `File | null` or `readonly File[]`.
 * Which of the two is the control's own shape — a `file[]` is never `null` — and the compiler
 * has already checked that `multiple` says the same (`FUD1484`, `FUD1485`).
 *
 * Control → element: a `$set`, a drop that called `set`, or a `$reset`. `null` and `[]` empty the
 * input; a file is put into it through a `DataTransfer`, the one way the platform lets a script
 * fill a file input, and one all three engines have. Guarded like every other write: the files
 * the input already holds are not put back, or the browser would forget nothing and announce it.
 */

import { effect, untrack } from '@fudic/core';
import type { Control } from '../types.js';
import type { Cleanup, ErrorSlot } from './types.js';
import { bindErrors, follow, undo } from './wiring.js';

/** What a file control holds: one file or nothing, or the list of a `multiple`. */
type FileValue = File | null | readonly File[];

/** The files of a value, as a list. */
const listOf = (value: FileValue): readonly File[] => (value === null ? [] : Array.isArray(value) ? value : [value as File]);

/** The input already holds exactly these files, in this order. */
function holds(el: HTMLInputElement, files: readonly File[]): boolean {
  const own = el.files!;
  return own.length === files.length && files.every((f, i) => own[i] === f);
}

export function bindFile(el: HTMLInputElement, control: Control<FileValue>, slot: ErrorSlot): Cleanup {
  const many = Array.isArray(untrack(control));
  return undo([
    ...follow(
      [el],
      control,
      () => {
        // A file input fires `input` and `change` for one choice: the second write would be a
        // new list of the same files, and a moved value for nothing.
        if (holds(el, listOf(untrack(control)))) return;
        const chosen = [...el.files!];
        control.set(many ? chosen : (chosen[0] ?? null));
      },
      el.files!.length > 0,
    ),
    effect(() => {
      const files = listOf(control());
      if (holds(el, files)) return;
      if (files.length === 0) {
        el.value = '';
        return;
      }
      const transfer = new DataTransfer();
      for (const f of files) transfer.items.add(f);
      el.files = transfer.files;
    }),
    bindErrors([el], control, slot),
  ]);
}
