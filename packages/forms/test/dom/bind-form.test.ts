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

describe('bindForm — the submit is not delegated (BUG-37)', () => {
  it('subscribes on the `<form>` and not on its root', () => {
    const { el, summary, f, offs } = twoFields();
    // The measurement Pedro made by hand on `/delegacion`, turned into an assertion: patch
    // `addEventListener` and keep the RECEIVER of every call. Counting them would not say
    // this — the count is one either way, and where that one sits is the whole finding.
    const seen = witness(el, () => bindForm(el, f, summary));
    expect(seen).toEqual([el]);
    expect(seen).not.toContain(el.getRootNode());
    for (const o of offs) o();
  });

  it('validates even when the author’s handler stops the propagation', async () => {
    const { el, summary, f, offs } = twoFields();
    // Registered BEFORE the binding, which is the order the emit writes: the author's
    // `@submit` is wired with the markup and the control bindings come after it.
    el.addEventListener('submit', (event) => {
      // The ordinary way to write a `@submit`, and the one the shipped example writes.
      event.stopPropagation();
    });
    const off = bindForm(el, f, summary);
    await f.$validate();

    const submit = new Event('submit', { bubbles: true, cancelable: true });
    el.dispatchEvent(submit);

    // `stopPropagation` stops the jump to the NEXT object in the path; it does not cut
    // between listeners of the same one. With the binding on the `<form>` the validation is
    // out of its reach — with the binding on the root it was not, and this form submitted
    // itself invalid without a word.
    expect(submit.defaultPrevented).toBe(true);
    expect(f.a.touched()).toBe(true);
    off();
    for (const o of offs) o();
  });
});

/**
 * Run `act` with `addEventListener` patched, and answer with the `this` of every call.
 *
 * The prototype is found by WALKING UP from a real node instead of naming `EventTarget`: the
 * `EventTarget` of this module's scope is the one Node itself defines, and the elements come
 * from the DOM emulator, so the two are unrelated objects and patching the global would watch
 * a prototype nothing in the test inherits from.
 */
function witness(node: Node, act: () => void): EventTarget[] {
  let proto: object | null = Object.getPrototypeOf(node) as object | null;
  while (proto !== null && !Object.prototype.hasOwnProperty.call(proto, 'addEventListener')) {
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  if (proto === null) throw new Error('nothing in the chain owns `addEventListener`');

  const owner = proto as { addEventListener: EventTarget['addEventListener'] };
  const real = owner.addEventListener;
  const seen: EventTarget[] = [];
  owner.addEventListener = function (
    this: EventTarget,
    ...args: Parameters<EventTarget['addEventListener']>
  ): void {
    seen.push(this);
    real.apply(this, args);
  };
  try {
    act();
  } finally {
    owner.addEventListener = real;
  }
  return seen;
}
