/**
 * `FudicControlElement` — the base of a control-component (SDD-34 §3.3, §4.5).
 *
 * A component whose `<template shadowrootmode="open" formassociated>` carries the marker
 * extends this instead of `FudicElement`, and what it gains is the three things the standard
 * only grants a form-associated custom element:
 *
 * - **`static formAssociated = true`**, read by the browser when the class is DEFINED. That is
 *   why the marker cannot be anything but a compile-time decision: there is no declarative
 *   form of it, and this SDD does not pretend to invent one — it decides which class the emit
 *   extends, nothing more.
 * - **`ElementInternals`**, created in the constructor because that is the only moment
 *   `attachInternals()` may be called.
 * - **`delegatesFocus`** on its shadow root, without which a click on a `<label for>` outside
 *   the component moves the focus to the host and not to the `<input>` inside it. It carries
 *   the CLICK and the FOCUS, and nothing else: the input's NAME and DESCRIPTION do not cross a
 *   shadow boundary by focus. Those are carried by the bridge the component's author writes
 *   (`shadowrootreferencetarget`) and by the relay below (BUG-42 §4.8).
 *
 * It lives in `@fudic/forms` and not in `@fudic/core`, and that is a direction of dependency
 * rather than a filing decision: this base needs the type `Control<T>`, so `forms` depends on
 * `core` and never the other way round.
 *
 * **The control is picked up from the props, structurally.** §3.3 says the emit writes it, and
 * the emit cannot: what it emits is a STATIC factory, with no instance code to assign a field
 * in. What it does emit is the crossing — the reference the parent named with
 * `control="@f.body"` (decision 112) — into the same positional payload every prop travels in.
 * So the base finds it there, by the shape of a `Control<T>`, and wires the internals to it.
 * That keeps the compiler out of a coupling it does not need: the emit crosses a value, and
 * what the child makes of it is the child's.
 */

import { FudicElement, effect, type Cleanup } from '@fudic/core';
import { RELAYED, relay } from './relay.js';
import type { Control } from './types.js';

/**
 * Whether a crossed value is a `Control<T>`.
 *
 * Structural, and it has to be: what arrives is a value in a positional payload, and the
 * payload carries no schema (SDD-15 §4.2). A control is a callable with `set` and `touch` on
 * it — no other shape this package produces answers to all three.
 */
function isControl(value: unknown): value is Control<unknown> {
  if (typeof value !== 'function') return false;
  const candidate = value as Partial<Control<unknown>>;
  return typeof candidate.set === 'function' && typeof candidate.touch === 'function';
}

export abstract class FudicControlElement extends FudicElement {
  /** Read by the browser when the class is defined — which is why the marker is compile-time. */
  static readonly formAssociated = true;

  /** `ElementInternals`, created in the constructor: the only moment it can be. */
  protected readonly internals: ElementInternals;

  /** The node the parent crossed. Filled from the payload as the instance comes alive. */
  protected control: Control<unknown> | null = null;

  #wiring: Cleanup | null = null;

  /** Watches the host attributes the relay carries. */
  #watch: MutationObserver | null = null;

  constructor() {
    super();
    this.internals = this.attachInternals();
  }

  /**
   * `delegatesFocus`, so a click on an outside `<label for>` lands in the `<input>`. The bridge
   * — `referenceTarget`, the same one the server wrote — comes from the base, as for any
   * component.
   */
  protected override shadowInit(): ShadowRootInit {
    return { ...super.shadowInit(), delegatesFocus: true };
  }

  override h(props: readonly unknown[]): void {
    super.h(props);
    this.#wire(props);
    this.#follow();
  }

  override c(props: readonly unknown[]): void {
    super.c(props);
    this.#wire(props);
    this.#follow();
  }

  /** Created at runtime, the host may only now be in the tree its labels and markers live in. */
  connectedCallback(): void {
    this.#relay();
  }

  /**
   * An update may bring a different node — a parent that swapped which control this component
   * edits — so the wiring is redone. It is idempotent: the previous effects are torn down
   * first, and a payload that does not carry a control leaves the current one alone.
   *
   * The array is SPARSE on this path (BUG-18 §4.1): a hole means «unchanged», so a payload
   * with no control in it is not a payload that cleared it.
   */
  override u(props: readonly unknown[]): void {
    super.u(props);
    if (props.some(isControl)) this.#wire(props);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#unwire();
  }

  /**
   * The FIELD: the element its author named with `shadowrootreferencetarget` (decision 132). It
   * is where the bridge points and where the relay carries the name and the description. No
   * bridge, no relay.
   */
  #fieldId(): string | null {
    return (this.constructor as typeof FudicControlElement).referenceTarget;
  }

  /** Relays now, and again whenever the host changes what it says of itself. */
  #follow(): void {
    this.#relay();
    if (this.#watch !== null) return;
    this.#watch = new MutationObserver(() => {
      this.#relay();
    });
    this.#watch.observe(this, { attributes: true, attributeFilter: [...RELAYED] });
  }

  /**
   * What the host says, carried to the field (BUG-42 §4.8). Its labels only where the browser
   * has no bridge: with one, the `<label for>` already reaches the field, and relaying it too
   * would say the name twice. The day the bridge is everywhere, the `labels` argument goes.
   */
  #relay(): void {
    const id = this.#fieldId();
    const field = id === null ? null : (this.shadowRoot?.getElementById(id) ?? null);
    if (field === null) return;
    const bridged =
      'referenceTarget' in ShadowRoot.prototype &&
      Boolean((this.shadowRoot as ShadowRoot & { referenceTarget?: string | null }).referenceTarget);
    // `labels` is typed as a list of nodes, and every node in it is a `<label>`.
    relay(this, field, bridged ? null : ([...this.internals.labels] as Element[]));
  }

  /**
   * The host's validity, exposed the way a native control exposes its own.
   *
   * A form-associated element keeps it in its `ElementInternals`, which nobody outside can reach:
   * without this, the `<form>` that owns the host cannot tell it is the field that failed, and a
   * submit cannot send the focus into it (BUG-41).
   */
  get validity(): ValidityState {
    return this.internals.validity;
  }

  #unwire(): void {
    this.#wiring?.();
    this.#wiring = null;
  }

  /**
   * Follow the control with the two things `ElementInternals` exists for.
   *
   * `setFormValue` is what makes an OUTSIDE `<form>` — one belonging to an application that is
   * not fudic — pick the value up in its `FormData`. `setValidity` is what gives the host a
   * real `:invalid`, which is the only version of that state a stylesheet can rely on.
   *
   * The anchor of `setValidity` is `this`: a validity message with no anchor cannot be
   * reported, and the host is the element the user can be sent to.
   */
  #wire(props: readonly unknown[]): void {
    const control = props.find(isControl);
    if (control === undefined) return;
    this.#unwire();
    this.control = control;
    const offValue = effect(() => {
      const value = control();
      this.internals.setFormValue(value === null || value === undefined ? null : String(value));
    });
    const offValidity = effect(() => {
      // Worded as the author's marker words it: a `<form>` fudic does not bind still validates
      // natively, and its bubble should say what the page says, not the rule's code.
      if (control.errors() === null) this.internals.setValidity({});
      // An empty map has no text, and `setValidity` refuses a flag with an empty message.
      else this.internals.setValidity({ customError: true }, control.message() || 'invalid', this);
    });
    this.#wiring = () => {
      offValue();
      offValidity();
    };
  }
}
