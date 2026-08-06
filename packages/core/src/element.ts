/**
 * `FudicElement` — the base class of every N3 custom element (SDD-15 §3.7).
 *
 * The emitted chunk of a component carries its `static c($props)` factory and the
 * `customElements.define`, and NOTHING else: the two instance entry points, the private
 * controller field and the teardown are character for character the same in every
 * component, so they live here, once. That keeps a chunk under the ~1 kB budget the INP
 * measurements assume, and turns the contract into something verified by inheritance
 * instead of a convention each emitted chunk has to reproduce correctly.
 *
 * There is no `connectedCallback`, and that is the whole difference with the retired
 * SDD-14 class that did all its work there. A component does NOT know its own `data-id`
 * — that is page identity, not component identity — so it cannot read its own slice of the
 * payload. The runtime hands each instance its slice, per tag, at the moment it defines the
 * tag. `h` and `c` are entry points invoked from OUTSIDE, not lifecycle callbacks. The only
 * real callback is `disconnectedCallback`, because teardown IS the browser's decision.
 */

import { browserDom } from '@fudic/dom';
import type { Controller, FudicElementCtor } from './controller.js';

/**
 * The subclass's own factory. `this.constructor` — not `new.target`, which is only bound
 * when a function is invoked with `new` and would be `undefined` inside a method call.
 */
const factoryOf = (el: FudicElement): FudicElementCtor =>
  el.constructor as unknown as FudicElementCtor;

export abstract class FudicElement extends HTMLElement {
  /** Private, so there is no external write surface on a live component. */
  #controller: Controller | null = null;

  /**
   * Entry point 1 — an instance that came from SSR. The shadow root is already populated
   * by the declarative shadow DOM, so the controller ADOPTS those nodes by positional
   * traversal. `props` is the instance's slice of the payload, handed over by the runtime.
   */
  h(props: readonly unknown[]): void {
    const controller = factoryOf(this).c([browserDom, this.shadowRoot, ...props]);
    this.#controller = controller;
    controller.h();
  }

  /**
   * Entry point 2 — an instance created at runtime by the parent controller. It did not
   * exist at build time, so it has no payload slice: the parent injects the props. There
   * is no shadow to adopt, so one is opened and the controller FABRICATES the nodes.
   */
  c(props: readonly unknown[]): void {
    const controller = factoryOf(this).c([
      browserDom,
      this.attachShadow({ mode: 'open' }),
      ...props,
    ]);
    this.#controller = controller;
    controller.c();
  }

  /**
   * Entry point 3 — the owner of the value writes it again (BUG-12). Not a lifecycle
   * callback: its caller is the PARENT, the one holding the signal, because what crossed
   * the shadow boundary was a value and a value cannot notify anyone. The array is the
   * same positional payload `h`/`c` take, forwarded verbatim — this base reshapes nothing.
   *
   * A no-op with no controller, for the same reason `disconnectedCallback` is: `define`
   * upgrades every instance of a tag at once, the ones the runtime never hydrates
   * included, and after `r()` the controller is already released. That tolerance is NOT a
   * props buffer — nothing is stored and nothing is replayed. There is no window to
   * buffer: the hydration cascade is strict post-order (SDD-17 §5), so by the time a
   * host's handler runs, every descendant of its subtree is defined and upgraded.
   */
  u(props: readonly unknown[]): void {
    this.#controller?.u(props);
  }

  /**
   * Symmetric teardown. A no-op on an instance that was never handed its props: `define`
   * upgrades every instance of a tag at once, including ones the runtime never hydrates,
   * and disconnecting those must not fail. Releasing the controller first also makes a
   * second disconnection a no-op rather than a second teardown.
   */
  disconnectedCallback(): void {
    const controller = this.#controller;
    if (controller === null) return;
    this.#controller = null;
    controller.r();
  }
}
