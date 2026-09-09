/**
 * @vitest-environment happy-dom
 *
 * `bindByType` — the one binding chosen at runtime (SDD-34 §4.2, decision 109).
 *
 * What is under test is that it picks the SAME binding the compiler would have picked for a
 * static `type`, and that a type it does not know binds nothing rather than falling back to
 * text. The fallback is the interesting half: a misspelt `"tex"` that quietly became a text
 * field would be a form that half works, which is worse than one that visibly does not.
 */

import { describe, expect, it } from 'vitest';
import { control } from '../../src/control.js';
import { bindByType } from '../../src/dom/bind-by-type.js';
import type { Control } from '../../src/types.js';
import { field, fire } from './_dom.js';

/** Bind an `<input type=…>` through the dispatch, as the emit does. */
function bound<T>(type: string, c: Control<T>): HTMLInputElement {
  const { el, slot } = field(`<input type="${type}">`);
  bindByType(el as HTMLInputElement, c as Control<unknown>, slot, type);
  return el as HTMLInputElement;
}

describe('it picks what the compiler would have picked', () => {
  it('a textual type reads and writes a string', () => {
    const c = control('');
    const el = bound('text', c);
    el.value = 'hola';
    fire(el, 'input');
    expect(c()).toBe('hola');
  });

  it('and so does an `<input>` with no type at all', () => {
    const c = control('');
    const { el, slot } = field('<input>');
    bindByType(el as HTMLInputElement, c as Control<unknown>, slot, '');
    (el as HTMLInputElement).value = 'x';
    fire(el, 'input');
    expect(c()).toBe('x');
  });

  it('a numeric type coerces, and its empty value is `null`', () => {
    const c = control<number | null>(0);
    const el = bound('number', c);
    el.value = '42';
    fire(el, 'input');
    expect(c()).toBe(42);
    el.value = '';
    fire(el, 'input');
    expect(c()).toBeNull();
  });

  it('a checkbox reads `checked`, not `value`', () => {
    const c = control(false);
    const el = bound('checkbox', c);
    el.checked = true;
    fire(el, 'change');
    expect(c()).toBe(true);
  });

  it('a lone radio binds as the group of one it is', () => {
    const c = control('');
    const { el, slot } = field('<input type="radio" value="a">');
    bindByType(el as HTMLInputElement, c as Control<unknown>, slot, 'radio');
    (el as HTMLInputElement).checked = true;
    fire(el, 'change');
    expect(c()).toBe('a');
  });

  it('the type is read case-insensitively, as the DOM reports it', () => {
    const c = control<number | null>(0);
    const el = bound('NUMBER', c);
    el.value = '7';
    fire(el, 'input');
    expect(c()).toBe(7);
  });
});

describe('a type it does not know binds nothing', () => {
  // `file` is not in this list because the DOM refuses a programmatic `value` on it at all —
  // which is the shape of the reason it is out of scope. It has its own assertion below.
  it.each(['tex', 'submit', 'button', 'image', 'reset'])('%s is inert', (type) => {
    const c = control('');
    const el = bound(type, c);
    el.value = 'ignored';
    fire(el, 'input');
    // Not «bound as text»: a `type` nobody planned for must not half work. `file` and the
    // valueless four are the same set `FUD0592` still rejects when the type is static.
    expect(c()).toBe('');
  });

  it('`file` binds nothing, and its cleanup is a no-op that can be called', () => {
    const c = control('');
    const { el, slot } = field('<input type="file">');
    const undo = bindByType(el as HTMLInputElement, c as Control<unknown>, slot, 'file');
    fire(el, 'input');
    fire(el, 'change');
    expect(c()).toBe('');
    expect(() => {
      undo();
    }).not.toThrow();
  });
});

describe('the cleanup is the chosen binding’s own', () => {
  it('undoing it stops the element from writing to the control', () => {
    const c = control('');
    const { el, slot } = field('<input type="text">');
    const undo = bindByType(el as HTMLInputElement, c as Control<unknown>, slot, 'text');
    undo();
    (el as HTMLInputElement).value = 'after';
    fire(el, 'input');
    expect(c()).toBe('');
  });
});
