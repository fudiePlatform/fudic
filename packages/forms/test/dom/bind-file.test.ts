/**
 * @vitest-environment happy-dom
 *
 * `bindFile` — `<input type="file">` (SDD-81 §3.7, decision 182). Criteria 26 and 27: choosing a
 * file makes the control that file, `$reset()` empties the input, and `set(file)` from code puts
 * the file in the input.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { file, files, formOf } from '../../src/contract/index.js';
import { bindFile } from '../../src/dom/index.js';
import type { Control } from '../../src/types.js';
import { blur, countWrites, field, fire } from './_dom.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

const png = (name = 'yo.png'): File => new File(['png'], name, { type: 'image/png' });

/** The user chooses these files in the dialog of the system. */
function choose(el: HTMLInputElement, chosen: readonly File[]): void {
  const transfer = new DataTransfer();
  for (const f of chosen) transfer.items.add(f);
  el.files = transfer.files;
  // A browser fires both for one choice.
  fire(el, 'input');
  fire(el, 'change');
}

function setup(multiple = false) {
  const f = formOf({ avatar: file(), docs: files() });
  const { el, slot } = field(`<input type="file"${multiple ? ' multiple' : ''}>`);
  const input = el as HTMLInputElement;
  const control = (multiple ? f.docs : f.avatar) as Control<File | null | readonly File[]>;
  const undo = bindFile(input, control, slot);
  return { f, input, slot, undo };
}

describe('one file (criterion 26)', () => {
  it('choosing a file makes the control that File; choosing none makes it null', () => {
    const { f, input } = setup();
    const one = png();
    choose(input, [one]);
    expect(f.avatar()).toBe(one);
    expect(f.avatar.dirty()).toBe(true);
    choose(input, []);
    expect(f.avatar()).toBeNull();
  });

  it('the input and change of one choice write once: the second finds the same files', () => {
    const { f, input } = setup();
    choose(input, [png()]);
    const after = f.avatar();
    fire(input, 'change');
    expect(f.avatar()).toBe(after);
  });

  it('$reset() empties the input', () => {
    const { f, input } = setup();
    choose(input, [png()]);
    f.$reset();
    expect(input.files!.length).toBe(0);
    expect(f.avatar()).toBeNull();
  });

  it('criterion 27: set(file) from code puts the file in the input, as a drop does', () => {
    const { f, input } = setup();
    const dropped = png('soltada.png');
    f.avatar.set(dropped);
    expect(input.files!.length).toBe(1);
    expect(input.files![0]).toBe(dropped);
  });

  it('a value the input already holds is not put back', () => {
    const { f, input } = setup();
    const writes = countWrites(input, 'files');
    choose(input, [png()]);
    // The one write is the user's choice in `choose`: the effect found the same file there.
    expect(writes()).toBe(1);
    expect(f.avatar()).not.toBeNull();
  });

  it('a file chosen before the binding existed is read at once', () => {
    const f = formOf({ avatar: file() });
    const { el, slot } = field('<input type="file">');
    const input = el as HTMLInputElement;
    const early = png();
    const transfer = new DataTransfer();
    transfer.items.add(early);
    input.files = transfer.files;
    bindFile(input, f.avatar as Control<File | null>, slot);
    expect(f.avatar()).toBe(early);
  });

  it('its error is painted once the field is left, and undoing stops everything', async () => {
    const f = formOf({ avatar: file(null, [(v) => (v === null ? { required: true } : null)]) });
    const { el, slot } = field('<input type="file">');
    const input = el as HTMLInputElement;
    const undo = bindFile(input, f.avatar as Control<File | null>, slot);
    blur(input);
    await Promise.resolve();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(slot.textContent).toBe('required');
    undo();
    choose(input, [png()]);
    expect(f.avatar()).toBeNull();
  });
});

describe('criterion 28: the rules speak on choosing', () => {
  it('a file the rules refuse paints its error at the change, with no blur', async () => {
    const big = (v: File | null) => (v !== null && v.size > 2 ? { 'max-size': 2 } : null);
    const f = formOf({ avatar: file(null, [big]) });
    const { el, slot } = field('<input type="file">');
    const input = el as HTMLInputElement;
    bindFile(input, f.avatar as Control<File | null>, slot);
    choose(input, [png()]);
    await Promise.resolve();
    expect(f.avatar.touched()).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(slot.textContent).toBe('max-size');
    choose(input, [new File(['a'], 'a.png', { type: 'image/png' })]);
    await Promise.resolve();
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });
});

describe('several files, with multiple', () => {
  it('choosing makes the control the list; none makes it []', () => {
    const { f, input } = setup(true);
    const two = [png('a.png'), png('b.png')];
    choose(input, two);
    expect(f.docs()).toEqual(two);
    choose(input, []);
    expect(f.docs()).toEqual([]);
  });

  it('set(list) puts every file in the input, in order; $reset() empties it', () => {
    const { f, input } = setup(true);
    const two = [png('a.png'), png('b.png')];
    f.docs.set(two);
    expect([...input.files!]).toEqual(two);
    f.$reset();
    expect(input.files!.length).toBe(0);
  });
});
