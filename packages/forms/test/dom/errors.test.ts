/**
 * @vitest-environment happy-dom
 *
 * SDD-34 §6.12 — the error effect: nothing is painted while the control is untouched, both the
 * text and `aria-invalid` appear the moment it is, and both are withdrawn when the error goes.
 *
 * And decision 113 as an assertion: the slot is the element the emit already wrote. The runtime
 * writes its TEXT and never creates, moves or removes a node — which is what makes a form's
 * accessibility identical whether it hydrated or not.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { control, form, required } from '../../src/index.js';
import { bindGroup, bindText, setMessages } from '../../src/dom/index.js';
import { blur, field, fire, mount } from './_dom.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  setMessages({});
});

describe('the error effect (§6.12)', () => {
  it('paints nothing while the control is untouched, and everything the moment it is', async () => {
    const { el, slot } = field('<input type="text">');
    // `form()` CLONES its schema (SDD-33): the node that is bound is the form's own, never
    // the template's — a bug this test would otherwise be written straight into.
    const f = form({ title: control('', [required]) });
    const c = f.title;
    const off = bindText(el as HTMLInputElement, c, slot);

    await f.$validate();
    // A required field is not WRONG for being still empty: it is unfilled. This is the path
    // that keeps a form from greeting a user with six red messages for six fields they have
    // not reached.
    expect(c.errors()).not.toBeNull();
    expect(slot.textContent).toBe('');
    expect(el.hasAttribute('aria-invalid')).toBe(false);

    blur(el);
    expect(slot.textContent).toBe('required');
    expect(el.getAttribute('aria-invalid')).toBe('true');
    off();
  });

  it('withdraws both when the error goes', () => {
    const { el, slot } = field('<input type="text">');
    const f = form({ title: control('') });
    const c = f.title;
    const off = bindText(el as HTMLInputElement, c, slot);

    // An error that arrives from OUTSIDE marks the control touched by itself (SDD-33): a 422
    // is about something the user already sent, so hiding it until they blur the field would
    // hide it forever.
    f.$setErrors({ title: { required: true } });
    expect(c.touched()).toBe(true);
    expect(slot.textContent).toBe('required');
    expect(el.getAttribute('aria-invalid')).toBe('true');

    f.$setErrors(null);
    expect(slot.textContent).toBe('');
    expect(el.hasAttribute('aria-invalid')).toBe(false);
    off();
  });

  it('writes the slot the emit left, and creates no node of its own', () => {
    const { el, slot } = field('<input type="text">');
    const parent = slot.parentElement!;
    const before = parent.childNodes.length;
    // `form()` CLONES its schema (SDD-33): the node that is bound is the form's own, never
    // the template's — a bug this test would otherwise be written straight into.
    const f = form({ title: control('') });
    const c = f.title;
    const off = bindText(el as HTMLInputElement, c, slot);

    c.touch();
    f.$setErrors({ title: { minLength: 3 } });
    expect(slot.textContent).toBe('minLength');
    expect(parent.childNodes.length).toBe(before);
    // The reference never moves either: `aria-describedby` points where it always pointed.
    expect(el.getAttribute('aria-describedby')).toBe('e1');
    expect(slot.id).toBe('e1');
    off();
  });

  it('an error map with no rule in it marks the field and says nothing', () => {
    // A server can publish `{}` for a path. It is invalid — that is what the map says — and
    // there is no rule to name, so the slot stays empty rather than showing a made-up word.
    const { el, slot } = field('<input type="text">');
    const f = form({ title: control('') });
    const off = bindText(el as HTMLInputElement, f.title, slot);
    f.$setErrors({ title: {} });
    expect(el.getAttribute('aria-invalid')).toBe('true');
    expect(slot.textContent).toBe('');
    off();
  });

  it('shows the FIRST rule that failed', () => {
    const { el, slot } = field('<input type="text">');
    // `form()` CLONES its schema (SDD-33): the node that is bound is the form's own, never
    // the template's — a bug this test would otherwise be written straight into.
    const f = form({ title: control('') });
    const c = f.title;
    const off = bindText(el as HTMLInputElement, c, slot);
    c.touch();
    f.$setErrors({ title: { required: true, minLength: 3 } });
    expect(slot.textContent).toBe('required');
    off();
  });
});

describe('setMessages (§3.2)', () => {
  it('replaces the rule code with the author’s sentence, and gets what it measured', () => {
    setMessages({
      required: () => 'Obligatorio',
      minLength: (v) => `Mínimo ${String(v)} caracteres`,
    });
    const { el, slot } = field('<input type="text">');
    // `form()` CLONES its schema (SDD-33): the node that is bound is the form's own, never
    // the template's — a bug this test would otherwise be written straight into.
    const f = form({ title: control('') });
    const c = f.title;
    const off = bindText(el as HTMLInputElement, c, slot);
    c.touch();

    f.$setErrors({ title: { required: true } });
    expect(slot.textContent).toBe('Obligatorio');
    f.$setErrors({ title: { minLength: 3 } });
    expect(slot.textContent).toBe('Mínimo 3 caracteres');

    // A rule with no message still says something: the code, which is wrong for a user and
    // unmistakable for a developer.
    f.$setErrors({ title: { pattern: '^x' } });
    expect(slot.textContent).toBe('pattern');
    off();
  });
});

describe('bindGroup (§3.2)', () => {
  it('marks the element the author chose when the group has errors', () => {
    const host = mount('<fieldset></fieldset>');
    const el = host.querySelector('fieldset') as HTMLElement;
    const seo = form({ canonical: control('') });
    const off = bindGroup(el, seo);

    expect(el.hasAttribute('aria-invalid')).toBe(false);
    seo.$setErrors({ canonical: { required: true } });
    expect(el.getAttribute('aria-invalid')).toBe('true');
    seo.$setErrors(null);
    expect(el.hasAttribute('aria-invalid')).toBe(false);

    // A form-level error with no field of its own counts just the same.
    seo.$setErrors({}, { mismatch: true });
    expect(el.getAttribute('aria-invalid')).toBe('true');
    off();
  });
});
