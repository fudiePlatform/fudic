/**
 * @vitest-environment happy-dom
 *
 * What the user did BEFORE the binding existed — an autofill, or typing while the component's
 * chunk was still downloading — is not erased by it. The model → element effect used to write
 * the model's initial value over the field at once: in Chrome, `fill()` on the three fields of
 * `user-form` left them empty once it hydrated.
 *
 * Each binding tells «edited» from «painted» by the element's own defaults (`defaultValue`,
 * `defaultChecked`, `defaultSelected`), which are what the HTML said. Three cases per binding:
 *
 *  1. adopted, painted with a value, and the user already changed it → the model takes the
 *     element's, and the element is not overwritten;
 *  2. adopted and untouched → the model rules;
 *  3. created by the client (a fresh element), with a value in the model → the model rules.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { control } from '../../src/contract/index.js';
import {
  bindCheckbox,
  bindNumber,
  bindRadio,
  bindSelect,
  bindSelectMultiple,
  bindText,
} from '../../src/dom/index.js';
import { field, mount } from './_dom.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

/** A slot of its own, for an element the client built. */
function freshSlot(): HTMLElement {
  const slot = document.createElement('span');
  document.body.append(slot);
  return slot;
}

describe('bindText', () => {
  it('1. keeps what the user typed over the painted value, and the model takes it', () => {
    const { el, slot } = field('<input type="text" value="Ana">');
    const input = el as HTMLInputElement;
    input.value = 'Ana Pérez';
    const c = control('Ana');
    const off = bindText(input, c, slot);
    expect(c()).toBe('Ana Pérez');
    expect(input.value).toBe('Ana Pérez');
    off();
  });

  it('1. and over an empty painted field, which is the autofill case', () => {
    const { el, slot } = field('<input type="text">');
    const input = el as HTMLInputElement;
    input.value = 'ana@example.com';
    const c = control('');
    const off = bindText(input, c, slot);
    expect(c()).toBe('ana@example.com');
    expect(input.value).toBe('ana@example.com');
    off();
  });

  it('2. untouched, the model rules', () => {
    const { el, slot } = field('<input type="text" value="Ana">');
    const input = el as HTMLInputElement;
    const c = control('Luis');
    const off = bindText(input, c, slot);
    expect(c()).toBe('Luis');
    expect(input.value).toBe('Luis');
    off();
  });

  it('3. a fresh element takes the model', () => {
    const input = document.createElement('input');
    const c = control('Luis');
    const off = bindText(input, c, freshSlot());
    expect(input.value).toBe('Luis');
    off();
  });
});

describe('bindNumber', () => {
  it('1. keeps the number the user typed, and the model takes it', () => {
    const { el, slot } = field('<input type="number" value="3">');
    const input = el as HTMLInputElement;
    input.value = '7';
    const c = control<number | null>(3);
    const off = bindNumber(input, c, slot);
    expect(c()).toBe(7);
    expect(input.value).toBe('7');
    off();
  });

  it('2. untouched, the model rules', () => {
    const { el, slot } = field('<input type="number" value="3">');
    const input = el as HTMLInputElement;
    const c = control<number | null>(5);
    const off = bindNumber(input, c, slot);
    expect(c()).toBe(5);
    expect(input.value).toBe('5');
    off();
  });

  it('3. a fresh element takes the model', () => {
    const input = document.createElement('input');
    input.type = 'number';
    const c = control<number | null>(5);
    const off = bindNumber(input, c, freshSlot());
    expect(input.value).toBe('5');
    off();
  });
});

describe('bindCheckbox', () => {
  it('1. keeps the tick the user gave, and the model takes it', () => {
    const { el, slot } = field('<input type="checkbox">');
    const input = el as HTMLInputElement;
    input.checked = true;
    const c = control(false);
    const off = bindCheckbox(input, c, slot);
    expect(c()).toBe(true);
    expect(input.checked).toBe(true);
    off();
  });

  it('1. and the one the user took away from a painted `checked`', () => {
    const { el, slot } = field('<input type="checkbox" checked>');
    const input = el as HTMLInputElement;
    input.checked = false;
    const c = control(true);
    const off = bindCheckbox(input, c, slot);
    expect(c()).toBe(false);
    expect(input.checked).toBe(false);
    off();
  });

  it('2. untouched, the model rules', () => {
    const { el, slot } = field('<input type="checkbox" checked>');
    const input = el as HTMLInputElement;
    const c = control(false);
    const off = bindCheckbox(input, c, slot);
    expect(input.checked).toBe(false);
    off();
  });

  it('3. a fresh element takes the model', () => {
    const input = document.createElement('input');
    input.type = 'checkbox';
    const c = control(true);
    const off = bindCheckbox(input, c, freshSlot());
    expect(input.checked).toBe(true);
    off();
  });
});

describe('bindRadio', () => {
  /** A group of three, `checked` painted on `painted` (or none). */
  function group(painted?: string): { radios: HTMLInputElement[]; slot: HTMLElement } {
    const host = mount(
      ['a', 'b', 'c']
        .map((v) => `<input type="radio" name="tone" value="${v}"${v === painted ? ' checked' : ''} aria-describedby="e1">`)
        .join('') + '<span id="e1"></span>',
    );
    return {
      radios: [...host.querySelectorAll('input')] as HTMLInputElement[],
      slot: host.querySelector('#e1') as HTMLElement,
    };
  }

  it('1. keeps the one the user chose, and the model takes it', () => {
    const { radios, slot } = group('a');
    radios[2]!.checked = true;
    const c = control('a');
    const off = bindRadio(radios, c, slot);
    expect(c()).toBe('c');
    expect(radios.map((r) => r.checked)).toEqual([false, false, true]);
    off();
  });

  it('1. and a group the user emptied reads as no value', () => {
    // Not reachable by a click, but by a reset of the form or a script before hydration.
    const { radios, slot } = group('b');
    radios[1]!.checked = false;
    const c = control('b');
    const off = bindRadio(radios, c, slot);
    expect(c()).toBe('');
    off();
  });

  it('2. untouched, the model rules', () => {
    const { radios, slot } = group('a');
    const c = control('b');
    const off = bindRadio(radios, c, slot);
    expect(radios.map((r) => r.checked)).toEqual([false, true, false]);
    off();
  });

  it('3. fresh elements take the model', () => {
    const radios = ['a', 'b'].map((v) => {
      const r = document.createElement('input');
      r.type = 'radio';
      r.name = 'fresh';
      r.value = v;
      document.body.append(r);
      return r;
    });
    const c = control('b');
    const off = bindRadio(radios, c, freshSlot());
    expect(radios.map((r) => r.checked)).toEqual([false, true]);
    off();
  });
});

/**
 * Two gaps of happy-dom, filled with what the HTML standard says, for the select cases alone:
 * `defaultSelected` is not implemented (it is `undefined`), and `selectedOptions` keeps the
 * options of the first time it was read. A browser has both, and the bindings read both.
 */
function standardOptions(): void {
  const option = Object.getOwnPropertyDescriptor(HTMLOptionElement.prototype, 'defaultSelected');
  const select = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedOptions');
  beforeAll(() => {
    Object.defineProperty(HTMLOptionElement.prototype, 'defaultSelected', {
      configurable: true,
      // The content attribute `selected`, reflected (HTML §4.10.10).
      get(this: HTMLOptionElement) {
        return this.hasAttribute('selected');
      },
    });
    Object.defineProperty(HTMLSelectElement.prototype, 'selectedOptions', {
      configurable: true,
      // A live list: the options whose selectedness is true, in tree order.
      get(this: HTMLSelectElement) {
        return [...this.options].filter((o) => o.selected);
      },
    });
  });
  afterAll(() => {
    if (option === undefined) delete (HTMLOptionElement.prototype as { defaultSelected?: boolean }).defaultSelected;
    else Object.defineProperty(HTMLOptionElement.prototype, 'defaultSelected', option);
    if (select !== undefined) Object.defineProperty(HTMLSelectElement.prototype, 'selectedOptions', select);
  });
}

describe('bindSelect', () => {
  standardOptions();

  const OPTIONS = (selected?: string): string =>
    ['a', 'b', 'c'].map((v) => `<option value="${v}"${v === selected ? ' selected' : ''}>${v}</option>`).join('');

  it('1. keeps the option the user picked over the painted one, and the model takes it', () => {
    const { el, slot } = field(`<select>${OPTIONS('a')}</select>`);
    const select = el as HTMLSelectElement;
    select.value = 'c';
    const c = control('a');
    const off = bindSelect(select, c, slot);
    expect(c()).toBe('c');
    expect(select.value).toBe('c');
    off();
  });

  it('1. and over the first, when none was painted `selected`', () => {
    const { el, slot } = field(`<select>${OPTIONS()}</select>`);
    const select = el as HTMLSelectElement;
    select.value = 'b';
    const c = control('a');
    const off = bindSelect(select, c, slot);
    expect(c()).toBe('b');
    off();
  });

  it('2. untouched, the model rules — the first shown by itself is no choice', () => {
    const { el, slot } = field(`<select>${OPTIONS()}</select>`);
    const select = el as HTMLSelectElement;
    const c = control('c');
    const off = bindSelect(select, c, slot);
    expect(c()).toBe('c');
    expect(select.value).toBe('c');
    off();
  });

  it('2. and with a painted `selected` left alone too', () => {
    const { el, slot } = field(`<select>${OPTIONS('b')}</select>`);
    const select = el as HTMLSelectElement;
    const c = control('c');
    const off = bindSelect(select, c, slot);
    expect(select.value).toBe('c');
    off();
  });

  it('3. a fresh select with no option marked takes the model', () => {
    const select = document.createElement('select');
    for (const v of ['a', 'b', 'c']) {
      const option = document.createElement('option');
      option.value = v;
      select.append(option);
    }
    const c = control('b');
    const off = bindSelect(select, c, freshSlot());
    expect(c()).toBe('b');
    expect(select.value).toBe('b');
    off();
  });
});

describe('bindSelectMultiple', () => {
  standardOptions();

  const MULTIPLE = (selected: readonly string[]): string =>
    `<select multiple>${['a', 'b', 'c']
      .map((v) => `<option value="${v}"${selected.includes(v) ? ' selected' : ''}>${v}</option>`)
      .join('')}</select>`;

  it('1. keeps what the user selected, and the model takes it', () => {
    const { el, slot } = field(MULTIPLE(['a']));
    const select = el as HTMLSelectElement;
    select.options[2]!.selected = true;
    const c = control<readonly string[]>(['a']);
    const off = bindSelectMultiple(select, c, slot);
    expect(c()).toEqual(['a', 'c']);
    expect([...select.selectedOptions].map((o) => o.value)).toEqual(['a', 'c']);
    off();
  });

  it('2. untouched, the model rules', () => {
    const { el, slot } = field(MULTIPLE(['a']));
    const select = el as HTMLSelectElement;
    const c = control<readonly string[]>(['b', 'c']);
    const off = bindSelectMultiple(select, c, slot);
    expect([...select.selectedOptions].map((o) => o.value)).toEqual(['b', 'c']);
    off();
  });

  it('3. a fresh select takes the model', () => {
    const select = document.createElement('select');
    select.multiple = true;
    for (const v of ['a', 'b', 'c']) {
      const option = document.createElement('option');
      option.value = v;
      select.append(option);
    }
    const c = control<readonly string[]>(['b']);
    const off = bindSelectMultiple(select, c, freshSlot());
    expect([...select.selectedOptions].map((o) => o.value)).toEqual(['b']);
    off();
  });
});
