/**
 * @vitest-environment happy-dom
 *
 * SDD-34 §6.11 — the six bind functions: element → control in `input` and `change`, `touch()`
 * on `blur`, and a write back that does not touch the element when the value already matches.
 *
 * The environment is declared per FILE and not in `vitest.config.ts`, and that is deliberate:
 * the package default stays `node`, because the model is what has to run on the server. Only
 * the browser entry point asks for a DOM, and it asks for it here.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { control } from '../../src/index.js';
import {
  bindCheckbox,
  bindNumber,
  bindRadio,
  bindSelect,
  bindSelectMultiple,
  bindText,
} from '../../src/dom/index.js';
import { countWrites, field, fire, mount } from './_dom.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('bindText (§6.11)', () => {
  it('writes the control on `input` and on `change`', () => {
    const { el, slot } = field('<input type="text">');
    const input = el as HTMLInputElement;
    const c = control('');
    const off = bindText(input, c, slot);

    input.value = 'hola';
    fire(input, 'input');
    expect(c()).toBe('hola');

    // `change` too: an autofill or a datalist pick raises that one and not `input`.
    input.value = 'adios';
    fire(input, 'change');
    expect(c()).toBe('adios');
    off();
  });

  it('marks `touched` on blur, and not before', () => {
    const { el, slot } = field('<input type="text">');
    const c = control('');
    const off = bindText(el as HTMLInputElement, c, slot);
    expect(c.touched()).toBe(false);
    fire(el, 'blur');
    expect(c.touched()).toBe(true);
    off();
  });

  it('a write by code reaches the element', () => {
    const { el, slot } = field('<input type="text">');
    const input = el as HTMLInputElement;
    const c = control('');
    const off = bindText(input, c, slot);
    c.set('desde el modelo');
    expect(input.value).toBe('desde el modelo');
    off();
  });

  it('does NOT write the element when the value already matches (BUG-12: the caret)', () => {
    const { el, slot } = field('<input type="text">');
    const input = el as HTMLInputElement;
    const c = control('hola');
    const off = bindText(input, c, slot);
    // The initial effect has already put the value in; count from here.
    const writes = countWrites(input, 'value');

    c.set('hola');
    expect(writes()).toBe(0);
    c.set('otra');
    expect(writes()).toBe(1);

    // And the round trip: what the USER typed is not written back at them either.
    input.value = 'tecleado';
    fire(input, 'input');
    expect(c()).toBe('tecleado');
    expect(writes()).toBe(2); // the one assignment the test itself made
    off();
  });

  it('the cleanup unsubscribes both directions', () => {
    const { el, slot } = field('<input type="text">');
    const input = el as HTMLInputElement;
    const c = control('');
    bindText(input, c, slot)();

    input.value = 'ignorado';
    fire(input, 'input');
    expect(c()).toBe('');
    c.set('tampoco');
    expect(input.value).toBe('ignorado');
  });

  it('binds a textarea with the same function', () => {
    const { el, slot } = field('<textarea></textarea>');
    const area = el as HTMLTextAreaElement;
    const c = control('');
    const off = bindText(area, c, slot);
    area.value = 'cuerpo';
    fire(area, 'input');
    expect(c()).toBe('cuerpo');
    c.set('otro');
    expect(area.value).toBe('otro');
    off();
  });
});

describe('bindNumber (§6.11)', () => {
  it("coerces the empty field to `null` and a filled one to a number", () => {
    const { el, slot } = field('<input type="number">');
    const input = el as HTMLInputElement;
    const c = control<number | null>(null);
    const off = bindNumber(input, c, slot);

    input.value = '42';
    fire(input, 'input');
    expect(c()).toBe(42);

    input.value = '';
    fire(input, 'input');
    // `null` and not `0`: an empty field is unfilled, which is a different fact from zero.
    expect(c()).toBeNull();
    off();
  });

  it('writes back `null` as the empty string', () => {
    const { el, slot } = field('<input type="number">');
    const input = el as HTMLInputElement;
    const c = control<number | null>(7);
    const off = bindNumber(input, c, slot);
    expect(input.value).toBe('7');
    c.set(null);
    expect(input.value).toBe('');
    off();
  });

  it('does not rewrite the element for the same number', () => {
    const { el, slot } = field('<input type="number">');
    const input = el as HTMLInputElement;
    const c = control<number | null>(3);
    const off = bindNumber(input, c, slot);
    const writes = countWrites(input, 'value');
    c.set(3);
    expect(writes()).toBe(0);
    off();
  });
});

describe('bindCheckbox (§6.11)', () => {
  it('carries `checked` in both directions', () => {
    const { el, slot } = field('<input type="checkbox">');
    const input = el as HTMLInputElement;
    const c = control(false);
    const off = bindCheckbox(input, c, slot);

    input.checked = true;
    fire(input, 'change');
    expect(c()).toBe(true);

    c.set(false);
    expect(input.checked).toBe(false);

    const writes = countWrites(input, 'checked');
    c.set(false);
    expect(writes()).toBe(0);
    off();
  });
});

describe('bindSelect (§6.11)', () => {
  it('carries the chosen value in both directions', () => {
    const host = mount(
      '<select aria-describedby="e1"><option value="a"></option><option value="b"></option></select>' +
        '<span id="e1"></span>',
    );
    const select = host.querySelector('select')!;
    const slot = host.querySelector('#e1') as HTMLElement;
    const c = control('a');
    const off = bindSelect(select, c, slot);

    select.value = 'b';
    fire(select, 'change');
    expect(c()).toBe('b');

    c.set('a');
    expect(select.value).toBe('a');

    const writes = countWrites(select, 'value');
    c.set('a');
    expect(writes()).toBe(0);
    off();
  });
});

describe('bindSelectMultiple (§6.11)', () => {
  it('carries an ARRAY, option by option', () => {
    const host = mount(
      '<select multiple aria-describedby="e1">' +
        '<option value="a"></option><option value="b"></option><option value="c"></option>' +
        '</select><span id="e1"></span>',
    );
    const select = host.querySelector('select')!;
    const slot = host.querySelector('#e1') as HTMLElement;
    const c = control<readonly string[]>([]);
    const off = bindSelectMultiple(select, c, slot);

    select.options[0]!.selected = true;
    select.options[2]!.selected = true;
    fire(select, 'change');
    expect(c()).toEqual(['a', 'c']);

    c.set(['b']);
    expect([...select.options].map((o) => o.selected)).toEqual([false, true, false]);

    const writes = countWrites(select.options[1]!, 'selected');
    c.set(['b']);
    expect(writes()).toBe(0);
    off();
  });
});

describe('every shape marks `touched` on blur (§6.11)', () => {
  it('checkbox, number, select and multiple select alike', () => {
    const cases: readonly (() => { c: { touched: () => boolean }; el: HTMLElement })[] = [
      () => {
        const { el, slot } = field('<input type="checkbox">');
        const c = control(false);
        bindCheckbox(el as HTMLInputElement, c, slot);
        return { c, el };
      },
      () => {
        const { el, slot } = field('<input type="number">');
        const c = control<number | null>(null);
        bindNumber(el as HTMLInputElement, c, slot);
        return { c, el };
      },
      () => {
        const { el, slot } = field('<select></select>');
        const c = control('');
        bindSelect(el as HTMLSelectElement, c, slot);
        return { c, el };
      },
      () => {
        const { el, slot } = field('<select multiple></select>');
        const c = control<readonly string[]>([]);
        bindSelectMultiple(el as HTMLSelectElement, c, slot);
        return { c, el };
      },
    ];
    for (const build of cases) {
      document.body.innerHTML = '';
      const { c, el } = build();
      expect(c.touched()).toBe(false);
      fire(el, 'blur');
      expect(c.touched()).toBe(true);
    }
  });
});

describe('bindRadio (§6.11, decision 108)', () => {
  it('N elements express ONE value, in both directions', () => {
    const host = mount(
      ['a', 'b', 'c']
        .map((v) => `<input type="radio" name="tone" value="${v}" aria-describedby="e1">`)
        .join('') + '<span id="e1"></span>',
    );
    const radios = [...host.querySelectorAll('input')] as HTMLInputElement[];
    const slot = host.querySelector('#e1') as HTMLElement;
    const c = control('');
    const off = bindRadio(radios, c, slot);

    radios[1]!.checked = true;
    fire(radios[1]!, 'change');
    expect(c()).toBe('b');

    c.set('c');
    expect(radios.map((r) => r.checked)).toEqual([false, false, true]);

    // Nothing chosen is the empty string — which is what a `required` on the group is for.
    radios[2]!.checked = false;
    fire(radios[2]!, 'change');
    expect(c()).toBe('');

    fire(radios[0]!, 'blur');
    expect(c.touched()).toBe(true);
    off();
  });

  it('the cleanup removes every listener of the group', () => {
    const host = mount(
      '<input type="radio" value="a"><input type="radio" value="b"><span id="e1"></span>',
    );
    const radios = [...host.querySelectorAll('input')] as HTMLInputElement[];
    const slot = host.querySelector('#e1') as HTMLElement;
    const c = control('');
    bindRadio(radios, c, slot)();
    radios[0]!.checked = true;
    fire(radios[0]!, 'change');
    expect(c()).toBe('');
  });
});
