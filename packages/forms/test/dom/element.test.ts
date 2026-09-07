/**
 * @vitest-environment happy-dom
 *
 * SDD-34 §3.3, §4.5 — `FudicControlElement`, the base of a control-component.
 *
 * The three things it exists for are the three the standard grants only a form-associated
 * custom element: `static formAssociated`, read when the class is DEFINED, which is why the
 * marker cannot be anything but compile-time; the `ElementInternals` its constructor creates,
 * the only moment it can be; and a shadow root that delegates focus, without which a
 * `<label for>` outside the component focuses the host and not the input inside.
 *
 * The behaviour that reaches a real browser — an outside label, a foreign `<form>`'s
 * `FormData`, `:invalid` — is §6.17 and §6.18, in Chrome. What is checked here is the wiring:
 * that the control is picked up from the payload and that the two `ElementInternals` calls
 * follow it.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { control, form } from '../../src/index.js';
import { FudicControlElement } from '../../src/element.js';
import type { Controller } from '@fudic/core';

/**
 * `attachInternals` does not exist in happy-dom, so the test provides it.
 *
 * A stand-in and not a shim of the production code: what `ElementInternals` DOES —
 * contributing to a `FormData`, turning the host `:invalid`, letting an outside `<label>`
 * reach in — is browser behaviour, and it is measured in Chrome (§6.17, §6.18). What is
 * measured here is that the wiring calls it, and for that a recorder is exactly enough.
 */
if (typeof HTMLElement.prototype.attachInternals !== 'function') {
  HTMLElement.prototype.attachInternals = function attachInternals(): ElementInternals {
    return { setFormValue: () => {}, setValidity: () => {} } as unknown as ElementInternals;
  };
}

/** A minimal emitted factory: the shape `static c($props)` has, with nothing in the template. */
function define(tag: string): void {
  if (customElements.get(tag) !== undefined) return;
  customElements.define(
    tag,
    class extends FudicControlElement {
      static c(): Controller {
        return { c: () => {}, h: () => {}, u: () => {}, r: () => {} };
      }
      /** The two protected fields, exposed for the assertions and for nothing else. */
      get seenControl(): unknown {
        return this.control;
      }
      get seenInternals(): ElementInternals {
        return this.internals;
      }
    },
  );
}

const TAG = 'app-input-test';
define(TAG);

type Probe = HTMLElement & {
  readonly seenControl: unknown;
  readonly seenInternals: ElementInternals;
  c(props: readonly unknown[]): void;
  h(props: readonly unknown[]): void;
  u(props: readonly unknown[]): void;
};

function mount(): Probe {
  const el = document.createElement(TAG) as Probe;
  document.body.append(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('the class the browser reads', () => {
  it('declares `formAssociated`, and a subclass inherits it', () => {
    expect(FudicControlElement.formAssociated).toBe(true);
    const ctor = customElements.get(TAG) as unknown as { formAssociated?: boolean };
    // Inherited through the prototype chain, which is how the browser reads it: the emitted
    // class declares nothing of its own.
    expect(ctor.formAssociated).toBe(true);
  });

  it('creates its ElementInternals in the constructor', () => {
    expect(mount().seenInternals).toBeDefined();
  });

  it('opens its shadow root with `delegatesFocus`', () => {
    // The INIT is what is asserted, not `shadowRoot.delegatesFocus`: happy-dom does not
    // reflect that property, and what the focus then does is browser behaviour — measured in
    // Chrome by §6.17, with the contrast that justifies the eager JavaScript.
    const el = mount();
    const inits: ShadowRootInit[] = [];
    const real = el.attachShadow.bind(el);
    el.attachShadow = (init: ShadowRootInit): ShadowRoot => {
      inits.push(init);
      return real(init);
    };
    el.c([]);
    expect(inits).toEqual([{ mode: 'open', delegatesFocus: true }]);
  });
});

describe('the control is picked up from the payload', () => {
  it('finds it among the crossed values, by shape', () => {
    const f = form({ title: control('') });
    const el = mount();
    el.c(['una constante', f.title, 7]);
    expect(el.seenControl).toBe(f.title);
  });

  it('finds it on the hydrate path too, over the markup the server sent', () => {
    // `h` adopts a shadow root the parser already materialised, so the control arrives the
    // same way and the internals are wired the same way — the state of a control-component
    // cannot depend on which of the two paths brought it up.
    const f = form({ title: control('') });
    const el = mount();
    el.attachShadow({ mode: 'open' });
    el.h([f.title]);
    expect(el.seenControl).toBe(f.title);
  });

  it('ignores a function that is not a control', () => {
    // Structural, so the shape is the whole test: a callback prop is a function too, and
    // handing it to `setFormValue` would put the source of a function in a `FormData`.
    const el = mount();
    el.c([() => 'un callback']);
    expect(el.seenControl).toBeNull();
  });

  it('leaves it alone when the payload carries none', () => {
    const el = mount();
    el.c(['solo constantes']);
    expect(el.seenControl).toBeNull();
  });

  it('an update that brings a different node rewires to it', () => {
    const f = form({ a: control('uno'), b: control('dos') });
    const el = mount();
    el.c([f.a]);
    expect(el.seenControl).toBe(f.a);
    el.u([f.b]);
    expect(el.seenControl).toBe(f.b);
    // A sparse update carries only what moved, so one without a control does not clear it.
    el.u([]);
    expect(el.seenControl).toBe(f.b);
  });
});

describe('the internals follow the control', () => {
  it('`setFormValue` follows the value, so a foreign `<form>` picks it up', () => {
    const f = form({ title: control('') });
    const el = mount();
    const seen: unknown[] = [];
    el.c([f.title]);
    el.seenInternals.setFormValue = (v: unknown): void => void seen.push(v);
    f.title.set('hola');
    expect(seen).toEqual(['hola']);
    // `null` is the empty a form model uses; it is not the string "null".
    f.title.set(null as unknown as string);
    expect(seen).toEqual(['hola', null]);
  });

  it('`setValidity` follows the errors, which is what gives a real `:invalid`', () => {
    const f = form({ title: control('') });
    const el = mount();
    const calls: unknown[][] = [];
    el.c([f.title]);
    el.seenInternals.setValidity = (...args: unknown[]): void => void calls.push(args);
    f.$setErrors({ title: { required: true } });
    expect(calls.at(-1)?.[0]).toEqual({ customError: true });
    // The message names the first rule that failed — the same one the error slot shows.
    expect(calls.at(-1)?.[1]).toBe('required');
    // An error map with no rule in it is still invalid, and the message says so rather than
    // being empty: a validity with no message cannot be reported.
    f.$setErrors({ title: {} });
    expect(calls.at(-1)?.[1]).toBe('invalid');
    f.$setErrors(null);
    expect(calls.at(-1)?.[0]).toEqual({});
  });

  it('disconnecting stops both', () => {
    const f = form({ title: control('') });
    const el = mount();
    el.c([f.title]);
    let writes = 0;
    el.seenInternals.setFormValue = (): void => void (writes += 1);
    el.remove();
    f.title.set('después');
    expect(writes).toBe(0);
  });
});
