import { browserDom } from '@fudic/dom';
import type { Controller, FudicElementCtor } from './controller.js';
import { adoptSheets } from './adopt-sheets.js';

// `this.constructor`, not `new.target`: inside a method call `new.target` is undefined.
const factoryOf = (el: FudicElement): FudicElementCtor =>
  el.constructor as unknown as FudicElementCtor;

// `extends HTMLElement` is evaluated with the module, so without a DOM importing
// `@fudic/core` on a server would throw. The stand-in is never registered there.
const Base: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

/**
 * Base class of every interactive component. A compiled component only adds its static
 * `c(props)` factory; instances are brought up from outside through `h` or `c`, never in
 * `connectedCallback`.
 */
export abstract class FudicElement extends Base {
  #controller: Controller | null = null;

  /** Adopts the shadow root the server rendered. `props` is this instance's state. */
  h(props: readonly unknown[]): void {
    const controller = factoryOf(this).c([browserDom, this.shadowRoot, ...props]);
    this.#controller = controller;
    controller.h();
  }

  /** Opens a shadow root and builds it, for an instance created in the browser. */
  c(props: readonly unknown[]): void {
    const shadow = this.attachShadow(this.shadowInit());
    const controller = factoryOf(this).c([browserDom, shadow, ...props]);
    this.#controller = controller;
    controller.c();
    // Same task as the content, so no frame paints it unstyled.
    adoptSheets(this, shadow);
  }

  /** How `c` opens the shadow root. Override to change the whole init. */
  protected shadowInit(): ShadowRootInit {
    const init: ShadowRootInit & { referenceTarget?: string } = { mode: 'open' };
    const ctor = this.constructor as typeof FudicElement;
    if (ctor.referenceTarget !== null) init.referenceTarget = ctor.referenceTarget;
    if (ctor.delegatesFocus) init.delegatesFocus = true;
    if (ctor.clonable) init.clonable = true;
    if (ctor.serializable) init.serializable = true;
    return init;
  }

  /** `shadowrootdelegatesfocus` of the component's template. */
  static readonly delegatesFocus: boolean = false;
  /** `shadowrootclonable` of the component's template. */
  static readonly clonable: boolean = false;
  /** `shadowrootserializable` of the component's template. */
  static readonly serializable: boolean = false;
  /** `shadowrootreferencetarget` of the component's template, or `null`. */
  static readonly referenceTarget: string | null = null;

  /**
   * Re-applies values from the parent. The array is forwarded as is: a hole means
   * "unchanged", a present `undefined` means "use the default". No-op before `h`/`c`.
   */
  u(props: readonly unknown[]): void {
    this.#controller?.u(props);
  }

  disconnectedCallback(): void {
    const controller = this.#controller;
    if (controller === null) return;
    // Released a microtask later: a keyed list moves rows by re-inserting them, and a
    // moved instance must keep its listeners.
    queueMicrotask(() => {
      if (this.isConnected) return;
      if (this.#controller !== controller) return;
      this.#controller = null;
      controller.r();
    });
  }
}
