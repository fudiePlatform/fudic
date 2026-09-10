/**
 * @vitest-environment happy-dom
 *
 * What a form's listeners cost (SDD-37 applied to `@fudic/forms`).
 *
 * The behaviour of the six bindings is measured in `bind.test.ts` and did not change; what
 * changed is the number, and a number is only worth asserting against a form that GROWS. So
 * this counts `addEventListener` over a form of two fields and over the same form with twelve,
 * and the claim is that the two counts are the same.
 */

import { describe, expect, it, vi } from 'vitest';
import { bindText } from '../../src/dom/bind-text.js';
import { control } from '../../src/control.js';
import { blur, fire } from './_dom.js';

/**
 * A form of `n` text fields inside its OWN shadow root, each with the error slot the emit
 * leaves behind it.
 *
 * A root of its own per form, because the tables are per root and outlive any one form: two
 * forms measured on `document` would give the second a count of zero, which is a true fact
 * about a shared root and not the one being asserted here.
 */
function fields(n: number): { root: ShadowRoot; inputs: HTMLInputElement[] } {
  const host = document.createElement('div');
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = Array.from(
    { length: n },
    (_, i) => `<input type="text" aria-describedby="e${i}"><span id="e${i}"></span>`,
  ).join('');
  return { root, inputs: [...root.querySelectorAll('input')] as HTMLInputElement[] };
}

/** Bind every field of a fresh form, counting the listeners the root was actually asked for. */
function bindAll(n: number): { added: number; removed: number; off: () => void } {
  const { root, inputs } = fields(n);
  const add = vi.spyOn(root, 'addEventListener');
  const remove = vi.spyOn(root, 'removeEventListener');

  const offs = inputs.map((el, i) =>
    bindText(el, control(''), root.querySelector(`#e${i}`) as HTMLElement),
  );
  return {
    added: add.mock.calls.length,
    removed: remove.mock.calls.length,
    off: () => {
      for (const undo of offs) undo();
      add.mockRestore();
      remove.mockRestore();
    },
  };
}

describe('a form costs the same in listeners whatever its size', () => {
  it('binds twelve fields with the listeners two fields need', () => {
    const small = bindAll(2);
    const large = bindAll(12);
    small.off();
    large.off();

    // Three types — `input`, `change` and the `focusout` a `blur` is delegated as — and the
    // number does not move with the number of fields. Without delegation these were 6 and 36.
    expect(small.added).toBe(3);
    expect(large.added).toBe(3);
  });

  it('takes back a row and never the root listener', () => {
    const one = bindAll(3);
    one.off();

    // Nothing to remove: a row leaves the table, and the listener above it stays for the root
    // it belongs to — which is what makes a form's teardown cost no main-thread work.
    expect(one.removed).toBe(0);
  });

  it('a second form on the same root adds nothing at all', () => {
    const { root, inputs } = fields(4);
    const first = bindText(inputs[0]!, control(''), root.querySelector('#e0') as HTMLElement);
    const add = vi.spyOn(root, 'addEventListener');
    const rest = inputs
      .slice(1)
      .map((el, i) => bindText(el, control(''), root.querySelector(`#e${i + 1}`) as HTMLElement));

    expect(add.mock.calls).toEqual([]);
    add.mockRestore();
    first();
    for (const off of rest) off();
  });
});

describe('and it still behaves exactly as it did', () => {
  it('writes the field that was typed into, and only that one', () => {
    const { root, inputs } = fields(3);
    const controls = inputs.map(() => control(''));
    inputs.forEach((el, i) =>
      bindText(el, controls[i]!, root.querySelector(`#e${i}`) as HTMLElement),
    );

    inputs[1]!.value = 'b';
    fire(inputs[1]!, 'input');

    expect(controls.map((c) => c())).toEqual(['', 'b', '']);
  });

  it('touches the field that lost the focus, and only that one', () => {
    const { root, inputs } = fields(3);
    const controls = inputs.map(() => control(''));
    inputs.forEach((el, i) =>
      bindText(el, controls[i]!, root.querySelector(`#e${i}`) as HTMLElement),
    );

    blur(inputs[2]!);

    expect(controls.map((c) => c.touched())).toEqual([false, false, true]);
  });

  it('leaves an element nobody bound alone, inside the same root', () => {
    const { root, inputs } = fields(1);
    const c = control('');
    bindText(inputs[0]!, c, root.querySelector('#e0') as HTMLElement);

    const alien = document.createElement('input');
    root.append(alien);
    alien.value = 'x';
    fire(alien, 'input');

    // The dispatch found no row for it and did nothing, which is what makes a form share a
    // shadow root with markup it does not own.
    expect(c()).toBe('');
  });

  it('undoing one field leaves the others listening', () => {
    const { root, inputs } = fields(2);
    const controls = inputs.map(() => control(''));
    const offs = inputs.map((el, i) =>
      bindText(el, controls[i]!, root.querySelector(`#e${i}`) as HTMLElement),
    );

    offs[0]!();
    inputs[0]!.value = 'gone';
    fire(inputs[0]!, 'input');
    inputs[1]!.value = 'here';
    fire(inputs[1]!, 'input');

    expect(controls.map((c) => c())).toEqual(['', 'here']);
  });
});
