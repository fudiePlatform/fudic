/**
 * SDD-83 §4.6 — the remedy for `shadowrootdelegatesfocus` where the parser ignored it.
 *
 * A host whose class asks for `delegatesFocus`, hydrated over a shadow root that does not
 * delegate, becomes focusable and passes the focus on to the first focusable element inside:
 * from `focus()`, and from a click aimed at it — what a `<label>` forwards to its control.
 *
 * happy-dom's shadow roots never delegate (it reads `init.delegateFocus`, a typo), which is
 * exactly the shadow root an old browser's parser leaves behind. A shadow root that does
 * delegate is stubbed where a test needs one.
 *
 * Acceptance criterion covered: 29, on the base every control extends.
 */

import { describe, expect, it } from 'vitest';
import { FudicElement } from '../src/element.js';
import type { Controller } from '../src/controller.js';

let counter = 0;

/** A component class, delegating or not, with an inert controller. */
function define(delegates: boolean): string {
  const tag = `app-focus${counter++}`;
  customElements.define(
    tag,
    class extends FudicElement {
      static override readonly delegatesFocus: boolean = delegates;
      static c(): Controller {
        return { c: () => {}, h: () => {}, u: () => {}, r: () => {} };
      }
    },
  );
  return tag;
}

/** A host with the shadow root the server's DSD left, `inner` as its content, hydrated. */
function hydrate(inner: string, { delegates = true, tabindex }: { delegates?: boolean; tabindex?: string } = {}) {
  const host = document.createElement(define(delegates)) as FudicElement;
  if (tabindex !== undefined) host.setAttribute('tabindex', tabindex);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = inner;
  document.body.append(host);
  host.h([]);
  return { host, shadow };
}

describe('the focus remedy (SDD-83 §4.6, criterion 29)', () => {
  it('host.focus() ends in the inner <input>', () => {
    const { host, shadow } = hydrate('<span>Name</span><input id="field">');
    expect(host.tabIndex).toBe(-1);
    host.focus();
    expect(shadow.activeElement).toBe(shadow.getElementById('field'));
    host.remove();
  });

  it('a click its <label> forwards to the host ends in the inner <input>', () => {
    const { host, shadow } = hydrate('<input type="hidden"><button disabled>x</button><textarea></textarea>');
    host.click();
    expect(shadow.activeElement).toBe(shadow.querySelector('textarea'));
    host.remove();
  });

  it('a click from inside the shadow root does not move the focus', () => {
    const { host, shadow } = hydrate('<span id="text">Name</span><input>');
    shadow.getElementById('text')!.click();
    expect(shadow.activeElement).toBeNull();
    host.remove();
  });

  it('leaves the focus where it lands inside, once it is there', () => {
    const { host, shadow } = hydrate('<input id="first"><input id="second">');
    const second = shadow.getElementById('second')!;
    second.focus();
    host.click();
    expect(shadow.activeElement).toBe(second);
    host.remove();
  });

  it('keeps the tabindex its author gave the host', () => {
    const { host } = hydrate('<input>', { tabindex: '0' });
    expect(host.getAttribute('tabindex')).toBe('0');
    host.remove();
  });

  it('with nothing focusable inside, the focus stays on the host', () => {
    const { host, shadow } = hydrate('<span>Nothing to focus</span>');
    host.focus();
    expect(shadow.activeElement).toBeNull();
    expect(document.activeElement).toBe(host);
    host.remove();
  });

  it('is not installed for a class that does not ask for delegatesFocus', () => {
    const { host, shadow } = hydrate('<input>', { delegates: false });
    expect(host.hasAttribute('tabindex')).toBe(false);
    host.click();
    expect(shadow.activeElement).toBeNull();
    host.remove();
  });

  it('is not installed over a shadow root that already delegates', () => {
    const host = document.createElement(define(true)) as FudicElement;
    const shadow = host.attachShadow({ mode: 'open' });
    Object.defineProperty(shadow, 'delegatesFocus', { value: true });
    shadow.innerHTML = '<input>';
    document.body.append(host);
    host.h([]);
    expect(host.hasAttribute('tabindex')).toBe(false);
    host.remove();
  });

  it('is not installed on a host with no shadow root to delegate into', () => {
    const host = document.createElement(define(true)) as FudicElement;
    document.body.append(host);
    host.h([]);
    expect(host.hasAttribute('tabindex')).toBe(false);
    host.remove();
  });

  it('is not needed by a component created on the client: its own shadow root delegates', () => {
    const host = document.createElement(define(true)) as FudicElement;
    document.body.append(host);
    host.c([]);
    expect(host.hasAttribute('tabindex')).toBe(false);
    host.remove();
  });
});
