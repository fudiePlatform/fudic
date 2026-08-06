/**
 * `FudicElement` — the emit contract of SDD-15 §3.7, checked from the outside: the base
 * routes to the SUBCLASS's factory, stays inert until someone hands it props, and tears
 * down only when the browser says so.
 *
 * Acceptance criteria covered: §6.9 (the base routes to the subclass's factory), §6.10
 * (no `connectedCallback`), §6.11 (the public interface is exactly `{c, h, u, r}`), and
 * BUG-12 §6.1–§6.2 (`u` is the third entry point, and a no-op with no controller).
 */

import { describe, expect, it } from 'vitest';
import { browserDom } from '@fudic/dom';
import { FudicElement } from '../src/element.js';
import type { Controller } from '../src/controller.js';

/** A fresh tag per test: `customElements.define` is global and one-shot per name. */
let counter = 0;
const freshTag = (): string => `app-el${counter++}`;

interface Spy {
  /** `$props` as the factory received it, per invocation. */
  readonly props: (readonly unknown[])[];
  /** Controller methods called, in order, prefixed by the label of the factory. */
  readonly calls: string[];
  /** The array each `u` was handed, per invocation. */
  readonly updates: (readonly unknown[])[];
}

/** A subclass whose `static c` records what it was handed and what was called on it. */
function define(spy: Spy, label = ''): string {
  const tag = freshTag();
  customElements.define(
    tag,
    class extends FudicElement {
      static c(props: readonly unknown[]): Controller {
        spy.props.push(props);
        return {
          c: () => spy.calls.push(`${label}c`),
          h: () => spy.calls.push(`${label}h`),
          u: (next: readonly unknown[]) => {
            spy.calls.push(`${label}u`);
            spy.updates.push(next);
          },
          r: () => spy.calls.push(`${label}r`),
        };
      }
    },
  );
  return tag;
}

const spy = (): Spy => ({ props: [], calls: [], updates: [] });

describe('FudicElement — instance entry points', () => {
  it('hydrates against the shadow root the DSD already populated', () => {
    const s = spy();
    const host = document.createElement(define(s));
    const shadow = host.attachShadow({ mode: 'open' }); // what the parser leaves behind
    document.body.append(host);

    (host as FudicElement).h([1, 'Pedro']);

    expect(s.props).toEqual([[browserDom, shadow, 1, 'Pedro']]);
    expect(s.calls).toEqual(['h']);
    host.remove();
  });

  it('opens its own shadow root when the instance is created at runtime', () => {
    const s = spy();
    const host = document.createElement(define(s));
    document.body.append(host);

    (host as FudicElement).c([7]);

    expect(host.shadowRoot).not.toBeNull();
    expect(s.props).toEqual([[browserDom, host.shadowRoot, 7]]);
    expect(s.calls).toEqual(['c']);
    host.remove();
  });

  it('passes the payload slice through verbatim, nested values included', () => {
    const s = spy();
    const host = document.createElement(define(s));
    host.attachShadow({ mode: 'open' });
    const bar = { id: 1 };

    (host as FudicElement).h([1, 'Pedro', bar]);

    expect(s.props[0]!.slice(2)).toEqual([1, 'Pedro', bar]);
    expect(s.props[0]![4]).toBe(bar); // by reference: the base does not copy or reshape
  });
});

/**
 * BUG-12 — `u` is the third entry point, and its caller is the PARENT: the owner of the
 * signal writes the value again. It is not a lifecycle callback, and it does not build
 * anything, so an instance with no controller has nothing to forward to and says nothing.
 */
describe('FudicElement — u, the update entry point (BUG-12 §6.1, §6.2)', () => {
  it('forwards the array to the controller after an h', () => {
    const s = spy();
    const host = document.createElement(define(s)) as FudicElement;
    host.attachShadow({ mode: 'open' });
    document.body.append(host);
    host.h([1]);

    host.u([2]);

    expect(s.calls).toEqual(['h', 'u']);
    expect(s.updates).toEqual([[2]]);
    host.remove();
  });

  it('forwards the array to the controller after a c', () => {
    const s = spy();
    const host = document.createElement(define(s)) as FudicElement;
    document.body.append(host);
    host.c([1]);

    host.u([2]);
    host.u([3]);

    expect(s.calls).toEqual(['c', 'u', 'u']);
    expect(s.updates).toEqual([[2], [3]]);
    host.remove();
  });

  it('hands the array over verbatim, by reference and unreshaped', () => {
    const s = spy();
    const host = document.createElement(define(s)) as FudicElement;
    host.attachShadow({ mode: 'open' });
    host.h([]);
    const next = [undefined, 'Pedro'];

    host.u(next);

    // No `$dom`/`$shadow` prepended: `u` is not an intake, it is the payload itself.
    expect(s.updates[0]).toBe(next);
  });

  it('is a no-op on an instance that was never handed its props', () => {
    const s = spy();
    const host = document.createElement(define(s)) as FudicElement;
    document.body.append(host);

    // `define` upgrades every instance of the tag at once, the ones the runtime never
    // hydrates included. A `u` on one of those must not build a controller behind its back.
    expect(() => host.u([1])).not.toThrow();
    expect(s.props).toEqual([]);
    expect(s.calls).toEqual([]);
    host.remove();
  });

  it('is a no-op after disconnectedCallback, and does not resurrect the controller', () => {
    const s = spy();
    const host = document.createElement(define(s)) as FudicElement;
    host.attachShadow({ mode: 'open' });
    document.body.append(host);
    host.h([1]);

    host.remove();
    expect(() => host.u([2])).not.toThrow();

    expect(s.calls).toEqual(['h', 'r']); // the `u` never reached the controller
    expect(s.updates).toEqual([]);
  });
});

describe('FudicElement — §6.9 the base routes to the subclass factory', () => {
  it('gives each subclass the controller of ITS own factory', () => {
    const a = spy();
    const b = spy();
    const hostA = document.createElement(define(a, 'A:'));
    const hostB = document.createElement(define(b, 'B:'));
    hostA.attachShadow({ mode: 'open' });
    hostB.attachShadow({ mode: 'open' });

    (hostA as FudicElement).h([]);
    (hostB as FudicElement).h([]);

    expect(a.calls).toEqual(['A:h']);
    expect(b.calls).toEqual(['B:h']);
  });
});

describe('FudicElement — §6.10 no connectedCallback', () => {
  it('stays inert when the host is connected: no factory, no hookup', () => {
    const s = spy();
    const tag = define(s);
    document.body.innerHTML = `<${tag}><template shadowrootmode="open"></template></${tag}>`;
    const host = document.body.firstElementChild as FudicElement;

    expect(s.props).toEqual([]); // upgraded by `define`, but not started
    expect(s.calls).toEqual([]);

    host.h([]); // only when the runtime hands it its slice
    expect(s.calls).toEqual(['h']);
    document.body.innerHTML = '';
  });
});

describe('FudicElement — teardown', () => {
  it('fires r() when the browser disconnects the host', () => {
    const s = spy();
    const host = document.createElement(define(s));
    host.attachShadow({ mode: 'open' });
    document.body.append(host);
    (host as FudicElement).h([]);

    host.remove();

    expect(s.calls).toEqual(['h', 'r']);
  });

  it('is a no-op on an instance that was never handed its props', () => {
    const s = spy();
    const host = document.createElement(define(s)) as FudicElement;
    document.body.append(host);

    host.remove(); // upgraded by `define`, never hydrated by the runtime

    expect(s.calls).toEqual([]);
  });

  it('tears down once, however many times it is disconnected', () => {
    const s = spy();
    const host = document.createElement(define(s)) as FudicElement;
    host.attachShadow({ mode: 'open' });
    document.body.append(host);
    host.h([]);

    host.remove();
    document.body.append(host);
    host.remove();

    expect(s.calls).toEqual(['h', 'r']);
  });
});

describe('FudicElement — §6.11 the controller interface is exactly {c, h, u, r}', () => {
  it('the base calls nothing else on it, and exposes no controller surface', () => {
    const seen: string[] = [];
    const tag = freshTag();
    customElements.define(
      tag,
      class extends FudicElement {
        static c(): Controller {
          return new Proxy({} as Controller, {
            get(_t, key) {
              seen.push(String(key));
              return () => undefined;
            },
          });
        }
      },
    );
    const host = document.createElement(tag) as FudicElement;
    host.attachShadow({ mode: 'open' });
    document.body.append(host);

    host.h([]);
    host.remove();

    // Never `m`, never `s` — those are private closures of the factory. `u` is part of
    // the contract, but the base never invokes it on its own: its caller is the parent.
    expect(seen).toEqual(['h', 'r']);
    expect(Object.keys(host)).toEqual([]); // `#controller` is private, not a property
  });
});
