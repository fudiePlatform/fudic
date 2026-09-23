/**
 * @vitest-environment happy-dom
 *
 * BUG-41 §6, criteria 5–12 — late to accuse, quick to forgive.
 *
 * The defect these pin: a field that showed an error kept it after being corrected, and the
 * form refused every later submit, because nothing ever validated again after the first one.
 * Criteria 5, 9, 10 and 11 were seen failing against the code before the fix.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { control, form, required } from '../../src/index.js';
import type { Control, Validator } from '../../src/index.js';
import {
  bindByType,
  bindCheckbox,
  bindForm,
  bindGroup,
  bindNumber,
  bindRadio,
  bindSelect,
  bindSelectMultiple,
  bindText,
} from '../../src/dom/index.js';
import type { Cleanup, ErrorSlot } from '../../src/dom/index.js';
import { blur, fire, mount } from './_dom.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

/** A rule that fails on the value each shape of element holds when it is «empty». */
const filled: Validator<unknown> = (v) =>
  v === '' || v === null || v === false || (Array.isArray(v) && v.length === 0)
    ? { required: true }
    : null;

/** One shape of element: how to build it, how to make it valid, and the event that says so. */
interface Shape {
  readonly name: string;
  readonly initial: unknown;
  readonly markup: string;
  readonly bind: (els: HTMLElement[], c: Control<unknown>, slot: ErrorSlot) => Cleanup;
  readonly fill: (els: HTMLElement[]) => void;
}

const SHAPES: readonly Shape[] = [
  {
    name: 'bindText',
    initial: '',
    markup: '<input type="text">',
    bind: ([el], c, s) => bindText(el as HTMLInputElement, c as Control<string>, s),
    fill: ([el]) => {
      (el as HTMLInputElement).value = 'hola';
    },
  },
  {
    name: 'bindNumber',
    initial: null,
    markup: '<input type="number">',
    bind: ([el], c, s) => bindNumber(el as HTMLInputElement, c as Control<number | null>, s),
    fill: ([el]) => {
      (el as HTMLInputElement).value = '3';
    },
  },
  {
    name: 'bindCheckbox',
    initial: false,
    markup: '<input type="checkbox">',
    bind: ([el], c, s) => bindCheckbox(el as HTMLInputElement, c as Control<boolean>, s),
    fill: ([el]) => {
      (el as HTMLInputElement).checked = true;
    },
  },
  {
    name: 'bindSelect',
    initial: '',
    markup: '<select><option value=""></option><option value="a">a</option></select>',
    bind: ([el], c, s) => bindSelect(el as HTMLSelectElement, c as Control<string>, s),
    fill: ([el]) => {
      (el as HTMLSelectElement).value = 'a';
    },
  },
  {
    name: 'bindSelectMultiple',
    initial: [],
    markup: '<select multiple><option value="a">a</option></select>',
    bind: ([el], c, s) =>
      bindSelectMultiple(el as HTMLSelectElement, c as Control<readonly string[]>, s),
    fill: ([el]) => {
      (el as HTMLSelectElement).options[0]!.selected = true;
    },
  },
  {
    name: 'bindRadio',
    initial: '',
    markup: '<input type="radio" value="a"><input type="radio" value="b">',
    bind: (els, c, s) => bindRadio(els as HTMLInputElement[], c as Control<string>, s),
    fill: (els) => {
      (els[1] as HTMLInputElement).checked = true;
    },
  },
  {
    name: 'bindByType',
    initial: '',
    markup: '<input type="text">',
    bind: ([el], c, s) => bindByType(el as HTMLInputElement, c, s, 'text'),
    fill: ([el]) => {
      (el as HTMLInputElement).value = 'hola';
    },
  },
];

/** Build a shape inside a form, with the author's marker beside it. */
function build(shape: Shape) {
  const host = mount(`${shape.markup}<small id="m"></small>`);
  const els = [...host.querySelectorAll<HTMLElement>('input, select')];
  const slot = host.querySelector<HTMLElement>('#m')!;
  const f = form({ c: control(shape.initial, [filled]) });
  const c = f.c as Control<unknown>;
  const off = shape.bind(els, c, slot);
  const last = els[els.length - 1]!;
  return { els, last, slot, c, off };
}

/** Let the validation the handler started settle. */
const settle = (): Promise<void> => Promise.resolve();

describe.each(SHAPES)('$name — late to accuse, quick to forgive (criterion 8)', (shape) => {
  it('leaving the field shows its error (criterion 6)', async () => {
    const { last, slot, off } = build(shape);
    blur(last);
    await settle();
    expect(slot.textContent).toBe('required');
    expect(last.getAttribute('aria-invalid')).toBe('true');
    off();
  });

  it('a field not yet touched is not validated while it is written (criterion 7)', async () => {
    const { els, last, c, off } = build(shape);
    fire(last, 'change');
    await settle();
    expect(c.errors()).toBeNull();
    expect(els[0]!.hasAttribute('aria-invalid')).toBe(false);
    off();
  });

  it('the error goes at the write that corrects it, with no submit (criterion 5)', async () => {
    const { els, last, slot, off } = build(shape);
    blur(last);
    await settle();
    expect(slot.textContent).toBe('required');

    shape.fill(els);
    fire(last, 'change');
    await settle();
    expect(slot.textContent).toBe('');
    expect(last.hasAttribute('aria-invalid')).toBe(false);
    off();
  });
});

describe('no marker (criterion 12)', () => {
  it('the binding works, marks `aria-invalid`, and writes text nowhere', async () => {
    const host = mount('<input type="text">');
    const el = host.querySelector('input')!;
    const f = form({ a: control('', [required]) });
    const off = bindText(el, f.a, null);

    blur(el);
    await settle();
    expect(el.getAttribute('aria-invalid')).toBe('true');
    expect(host.textContent).toBe('');

    el.value = 'x';
    fire(el, 'input');
    expect(f.a()).toBe('x');
    off();
  });
});

describe('the submit decides on what is known now', () => {
  function twoFields() {
    const host = mount(
      '<form><input id="a" type="text"><small id="ea"></small><button>ok</button></form>',
    );
    const el = host.querySelector('form')!;
    const input = host.querySelector<HTMLInputElement>('#a')!;
    const f = form({ a: control('', [required]) });
    const offs = [bindText(input, f.a, host.querySelector<HTMLElement>('#ea'))];
    return { el, input, f, offs };
  }

  const submit = (el: HTMLFormElement): Event => {
    const event = new Event('submit', { bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event;
  };

  it('the FIRST submit with an empty required field is stopped (criterion 10)', () => {
    const { el, input, f, offs } = twoFields();
    offs.push(bindForm(el, f, null));

    expect(submit(el).defaultPrevented).toBe(true);
    expect(f.a.touched()).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    for (const off of offs) off();
  });

  it('after correcting the field, the next submit goes through (criterion 9)', () => {
    const { el, input, f, offs } = twoFields();
    offs.push(bindForm(el, f, null));
    expect(submit(el).defaultPrevented).toBe(true);

    input.value = 'Ada';
    fire(input, 'input');
    expect(submit(el).defaultPrevented).toBe(false);
    for (const off of offs) off();
  });

  it('an author `@submit` registered FIRST already sees the verdict (criterion 11)', () => {
    const { el, f, offs } = twoFields();
    // Registered before the binding: the order the emit writes them in.
    let seen: boolean | undefined;
    el.addEventListener('submit', (e) => {
      seen = e.defaultPrevented;
    });
    offs.push(bindForm(el, f, null));

    submit(el);
    expect(seen).toBe(true);
    for (const off of offs) off();
  });

  it('the summary goes into the form’s marker with its own words', async () => {
    const host = mount('<form><div id="s"></div></form>');
    const el = host.querySelector('form')!;
    const slot = host.querySelector<HTMLElement>('#s')!;
    const f = form(
      { a: control('') },
      { summary: (root) => (root.a() === '' ? { empty: true } : null), messages: { empty: () => 'Vacío' } },
    );
    const off = bindForm(el, f, slot);

    await f.$validate();
    expect(slot.textContent).toBe('Vacío');
    off();
  });
});

describe('bindGroup and its marker', () => {
  it('writes the group’s summary into the marker, and takes it back', async () => {
    const host = mount('<fieldset><p id="g"></p></fieldset>');
    const el = host.querySelector('fieldset')!;
    const slot = host.querySelector<HTMLElement>('#g')!;
    const { group } = await import('../../src/group.js');
    const f = form({
      seo: group({ a: control('') }, [(v) => (v.a === '' ? { incomplete: true } : null)]),
    });
    const off = bindGroup(el, f.seo, slot);

    await f.$validate();
    expect(slot.textContent).toBe('incomplete');
    expect(el.getAttribute('aria-invalid')).toBe('true');

    f.seo.a.set('x');
    await f.$validate();
    expect(slot.textContent).toBe('');
    off();
  });

  it('works without one', async () => {
    const host = mount('<fieldset></fieldset>');
    const el = host.querySelector('fieldset')!;
    const { group } = await import('../../src/group.js');
    const f = form({ seo: group({ a: control('', [required]) }) });
    const off = bindGroup(el, f.seo);
    await f.$validate();
    expect(el.getAttribute('aria-invalid')).toBe('true');
    off();
  });
});
