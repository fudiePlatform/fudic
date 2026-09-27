/**
 * @vitest-environment happy-dom
 *
 * BUG-42 §6.B, criterion 16 — what names and describes a control-component's host, carried to
 * its field.
 *
 * happy-dom implements neither the bridge, nor `internals.labels`, nor element reflection as a
 * browser does: the reflected lists are read back as the plain properties the relay wrote, the
 * labels come from a stand-in, and the bridge is switched on by hand. The real thing is §6.G, in
 * Chrome, with and without the bridge.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Controller } from '@fudic/core';
import { FudicControlElement } from '../../src/element.js';
import { control, form } from '../../src/index.js';
import { relay } from '../../src/relay.js';

/** The labels the stand-in internals report, per host. */
const labelsOf = new WeakMap<HTMLElement, Element[]>();

HTMLElement.prototype.attachInternals = function attachInternals(this: HTMLElement): ElementInternals {
  const host = this;
  return {
    setFormValue: () => {},
    setValidity: () => {},
    get labels() {
      return labelsOf.get(host) ?? [];
    },
  } as unknown as ElementInternals;
};

interface Reflected {
  ariaDescribedByElements: readonly Element[] | null;
  ariaLabelledByElements: readonly Element[] | null;
}
const reflected = (el: Element): Reflected => el as unknown as Reflected;

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('relay', () => {
  function world(inner = '<input id="campo">') {
    document.body.innerHTML =
      '<label id="lab">Alias</label><span id="err">Mal.</span><span id="ext">Ext</span><x-host id="h"></x-host>';
    const host = document.getElementById('h')!;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = inner;
    return { host, field: root.getElementById('campo')!, root };
  }

  it('carries the host description and labelled-by, and its labels without a bridge', () => {
    const { host, field } = world();
    host.setAttribute('aria-describedby', 'err missing');
    host.setAttribute('aria-labelledby', 'ext');
    relay(host, field, [document.getElementById('lab')!]);
    expect(reflected(field).ariaDescribedByElements).toEqual([document.getElementById('err')]);
    expect(reflected(field).ariaLabelledByElements).toEqual([
      document.getElementById('ext'),
      document.getElementById('lab'),
    ]);
  });

  it('with a bridge, the labels are left to the browser', () => {
    const { host, field } = world();
    relay(host, field, null);
    expect(reflected(field).ariaLabelledByElements).toBeNull();
    expect(reflected(field).ariaDescribedByElements).toBeNull();
  });

  it('merges behind the field description, and adds no name to a field that has one', () => {
    const { host, field } = world(
      '<label for="campo">Dentro</label><input id="campo" aria-describedby="own"><small id="own">Propio</small>',
    );
    host.setAttribute('aria-describedby', 'err');
    host.setAttribute('aria-label', 'Fuera');
    relay(host, field, [document.getElementById('lab')!]);
    expect(reflected(field).ariaDescribedByElements!.map((e) => e.id)).toEqual(['own', 'err']);
    expect(reflected(field).ariaLabelledByElements).toBeNull();
    expect(field.hasAttribute('aria-label')).toBe(false);
  });

  it('carries the host aria-label, and takes it back when the host drops it', () => {
    const { host, field } = world();
    host.setAttribute('aria-label', 'Alias');
    relay(host, field, []);
    expect(field.getAttribute('aria-label')).toBe('Alias');
    host.removeAttribute('aria-label');
    relay(host, field, []);
    expect(field.hasAttribute('aria-label')).toBe(false);
  });

  it('keeps a field aria-label of its own', () => {
    const { host, field } = world('<input id="campo" aria-label="Propio" aria-labelledby="x">');
    host.setAttribute('aria-label', 'Fuera');
    relay(host, field, []);
    relay(host, field, []);
    expect(field.getAttribute('aria-label')).toBe('Propio');
  });

  it('a radio container takes it all', () => {
    const { host, field } = world('<fieldset id="campo"><input type="radio"></fieldset>');
    host.setAttribute('aria-describedby', 'err');
    relay(host, field, [document.getElementById('lab')!]);
    expect(reflected(field).ariaDescribedByElements).toEqual([document.getElementById('err')]);
    expect(reflected(field).ariaLabelledByElements).toEqual([document.getElementById('lab')]);
  });
});

/** A control-component whose factory writes its template: an input with the fixed id. */
class Field extends FudicControlElement {
  static override readonly referenceTarget: string | null = 'campo';
  static c([, root]: readonly unknown[]): Controller {
    const shadow = root as ShadowRoot;
    return {
      c: () => {
        shadow.innerHTML = '<input id="campo">';
      },
      h: () => {},
      u: () => {},
      r: () => {},
    };
  }
}
customElements.define('relay-field', Field);

/** One without a field: nothing to relay to. */
class Bare extends FudicControlElement {
  static c(): Controller {
    return { c: () => {}, h: () => {}, u: () => {}, r: () => {} };
  }
}
customElements.define('relay-bare', Bare);

type Probe = HTMLElement & { c(props: readonly unknown[]): void; h(props: readonly unknown[]): void };

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('FudicControlElement relays', () => {
  afterEach(() => {
    delete (ShadowRoot.prototype as { referenceTarget?: unknown }).referenceTarget;
  });

  it('opens its shadow root with the bridge to its field', () => {
    const el = document.createElement('relay-field') as Probe;
    const inits: ShadowRootInit[] = [];
    const real = el.attachShadow.bind(el);
    el.attachShadow = (init: ShadowRootInit): ShadowRoot => {
      inits.push(init);
      return real(init);
    };
    el.c([form({ a: control('') }).a]);
    expect(inits).toEqual([{ mode: 'open', delegatesFocus: true, referenceTarget: 'campo' }]);
  });

  it('associates its labels without a bridge, and follows the host attributes', async () => {
    document.body.innerHTML = '<label id="lab">Alias</label><span id="err">Mal.</span>';
    const el = document.createElement('relay-field') as Probe;
    labelsOf.set(el, [document.getElementById('lab')!]);
    el.c([form({ a: control('') }).a]);
    document.body.append(el);
    const field = el.shadowRoot!.getElementById('campo')!;
    expect(reflected(field).ariaLabelledByElements).toEqual([document.getElementById('lab')]);

    el.setAttribute('aria-describedby', 'err');
    await tick();
    expect(reflected(field).ariaDescribedByElements).toEqual([document.getElementById('err')]);
  });

  it('leaves the labels to a native bridge', () => {
    Object.defineProperty(ShadowRoot.prototype, 'referenceTarget', {
      configurable: true,
      get: () => 'campo',
    });
    const el = document.createElement('relay-field') as Probe;
    labelsOf.set(el, [document.createElement('label')]);
    document.body.append(el);
    el.c([form({ a: control('') }).a]);
    const field = el.shadowRoot!.getElementById('campo')!;
    expect(reflected(field).ariaLabelledByElements).toBeNull();
  });

  it('hydrates and relays too, and a second pass does not observe twice', () => {
    const el = document.createElement('relay-field') as Probe;
    const root = el.attachShadow({ mode: 'open' });
    root.innerHTML = '<input id="campo">';
    document.body.append(el);
    const a = form({ a: control('') }).a;
    el.h([a]);
    el.h([a]);
    expect(reflected(root.getElementById('campo')!).ariaLabelledByElements).toBeNull();
  });

  it('a component without a field has nothing to relay to', () => {
    const el = document.createElement('relay-bare') as Probe;
    const inits: ShadowRootInit[] = [];
    const real = el.attachShadow.bind(el);
    el.attachShadow = (init: ShadowRootInit): ShadowRoot => {
      inits.push(init);
      return real(init);
    };
    document.body.append(el);
    el.c([form({ a: control('') }).a]);
    expect(inits).toEqual([{ mode: 'open', delegatesFocus: true }]);
  });

  it('connected before its shadow root exists, it waits', () => {
    expect(() => document.body.append(document.createElement('relay-field'))).not.toThrow();
  });
});
