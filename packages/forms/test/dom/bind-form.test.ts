/**
 * @vitest-environment happy-dom
 *
 * SDD-34 §6.13 — `bindForm`: with the form invalid, `preventDefault`, `$touch()` in cascade,
 * focus on the FIRST invalid control in document order, and the summary written into the live
 * region. With it valid, no `preventDefault` and the author's own handler runs.
 *
 * Nothing here sends anything, and that is the criterion as much as the assertions are: this
 * binding is about STATE (§4.4). Who submits, and where, is the author's.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { control, form, required } from '../../src/index.js';
import { bindForm, bindText } from '../../src/dom/index.js';
import { fire, mount } from './_dom.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

/** A form of two required fields, each with the error slot the emit writes. */
function twoFields(): {
  el: HTMLFormElement;
  summary: HTMLElement;
  f: ReturnType<typeof buildForm>;
  offs: (() => void)[];
} {
  const host = mount(
    '<form>' +
      '<input id="a" type="text" aria-describedby="ea"><span id="ea"></span>' +
      '<input id="b" type="text" aria-describedby="eb"><span id="eb"></span>' +
      '</form><p id="sum" aria-live="polite"></p>',
  );
  const el = host.querySelector('form') as HTMLFormElement;
  const summary = host.querySelector('#sum') as HTMLElement;
  const f = buildForm();
  const offs = [
    bindText(host.querySelector('#a') as HTMLInputElement, f.a, host.querySelector(
      '#ea',
    ) as HTMLElement),
    bindText(host.querySelector('#b') as HTMLInputElement, f.b, host.querySelector(
      '#eb',
    ) as HTMLElement),
  ];
  return { el, summary, f, offs };
}

function buildForm() {
  return form(
    { a: control('', [required]), b: control('', [required]) },
    { summary: (root) => (root.a() === '' && root.b() === '' ? { empty: true } : null) },
  );
}

describe('bindForm — an invalid submit (§6.13)', () => {
  it('stops it, cascades `touch()`, and focuses the first invalid control', async () => {
    const { el, summary, f, offs } = twoFields();
    const off = bindForm(el, f, summary);
    // The errors are on record before the submit — which is the state a synchronous decision
    // can be made from (§4.4).
    await f.$validate();

    const submit = new Event('submit', { bubbles: true, cancelable: true });
    el.dispatchEvent(submit);

    expect(submit.defaultPrevented).toBe(true);
    expect(f.a.touched()).toBe(true);
    expect(f.b.touched()).toBe(true);
    // First in DOCUMENT order, which is what `querySelector` gives.
    expect((document.activeElement as HTMLElement).id).toBe('a');
    off();
    for (const o of offs) o();
  });

  it('writes `$summary()` into the live region', async () => {
    const { el, summary, f, offs } = twoFields();
    const off = bindForm(el, f, summary);
    expect(summary.textContent).toBe('');
    await f.$validate();
    // A text that changes INSIDE a live region is announced; the element is the emit's, so
    // there is one to change.
    expect(summary.textContent).toBe('empty');
    off();
    for (const o of offs) o();
  });

  it('focuses the SECOND control when the first one is fine', async () => {
    const { el, summary, f, offs } = twoFields();
    const off = bindForm(el, f, summary);
    f.a.set('lleno');
    await f.$validate();

    el.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect((document.activeElement as HTMLElement).id).toBe('b');
    off();
    for (const o of offs) o();
  });
});

describe('bindForm — a valid submit (§6.13)', () => {
  it('does not prevent it, and the author’s handler runs', async () => {
    const { el, summary, f, offs } = twoFields();
    const off = bindForm(el, f, summary);
    f.a.set('uno');
    f.b.set('dos');
    await f.$validate();
    expect(f.$errors()).toBeNull();

    let ran = 0;
    el.addEventListener('submit', (event) => {
      ran += 1;
      // The test is not a browser: stop the navigation happy-dom would otherwise attempt.
      event.preventDefault();
    });

    const submit = new Event('submit', { bubbles: true, cancelable: true });
    el.dispatchEvent(submit);
    expect(ran).toBe(1);
    off();
    for (const o of offs) o();
  });

  it('lets a never-validated form through, and starts the validation behind it', async () => {
    const { el, summary, f, offs } = twoFields();
    const off = bindForm(el, f, summary);

    const submit = new Event('submit', { bubbles: true, cancelable: true });
    el.dispatchEvent(submit);
    // `$validate` is asynchronous and `preventDefault` is not: a late answer cannot un-send
    // anything, so the courtesy check does not block the form while it thinks. The one who
    // decides is the server.
    expect(submit.defaultPrevented).toBe(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(f.$errors()).not.toBeNull();
    off();
    for (const o of offs) o();
  });
});

describe('bindForm — the summary is optional', () => {
  it('binds with no live region at all', async () => {
    const { el, f, offs } = twoFields();
    const off = bindForm(el, f, null);
    await f.$validate();
    const submit = new Event('submit', { bubbles: true, cancelable: true });
    el.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
    off();
    for (const o of offs) o();
  });

  it('the cleanup stops the listener and the live region alike', async () => {
    const { el, summary, f, offs } = twoFields();
    bindForm(el, f, summary)();
    await f.$validate();
    expect(summary.textContent).toBe('');
    const submit = new Event('submit', { bubbles: true, cancelable: true });
    el.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(false);
    for (const o of offs) o();
  });
});
